from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import osmnx as ox
import os

from models import RouteRequest, RouteResponse, CoverageResponse
from routing import generate_loop_route_tuned

app = FastAPI(title="RunRoute API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your frontend's actual URL before sharing publicly
    allow_methods=["*"],
    allow_headers=["*"],
)

GRAPH_PATH = "pune_graph.graphml"

# A route only counts as e.g. "dirt" if at least this share of it is on dirt
MIN_SURFACE_SHARE = 0.1

SURFACE_LABELS = {"road": "concrete road", "footpath": "footpath", "grass": "grass", "dirt": "dirt"}
G = None  # loaded at startup
COVERAGE = None  # bounding box of the loaded graph


@app.on_event("startup")
def load_graph():
    global G, COVERAGE
    if not os.path.exists(GRAPH_PATH):
        raise RuntimeError(
            f"{GRAPH_PATH} not found. Generate it first by running the "
            f"prototype notebook and calling ox.save_graphml(G, '{GRAPH_PATH}')."
        )
    G = ox.load_graphml(GRAPH_PATH)
    ys = [d["y"] for _, d in G.nodes(data=True)]
    xs = [d["x"] for _, d in G.nodes(data=True)]
    COVERAGE = CoverageResponse(south=min(ys), west=min(xs), north=max(ys), east=max(xs))


@app.get("/health")
def health():
    return {"status": "ok", "graph_loaded": G is not None}


@app.get("/coverage", response_model=CoverageResponse)
def coverage():
    if COVERAGE is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")
    return COVERAGE


from routing import generate_loop_route_tuned, generate_point_to_point_route, footpath_distance, surface_distance, route_coordinates

@app.post("/generate-route", response_model=RouteResponse)
def generate_route(req: RouteRequest):
    if G is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")

    if req.end_lat is not None and req.end_lon is not None:
        route, dist = generate_point_to_point_route(
            G, req.start_lat, req.start_lon, req.end_lat, req.end_lon, req.target_distance_m,
            surface=req.surface
        )
    else:
        route, dist = generate_loop_route_tuned(
            G, req.start_lat, req.start_lon, req.target_distance_m,
            surface=req.surface
        )

    if route is None:
        raise HTTPException(status_code=500, detail="Could not generate a route for this location")

    matched = surface_distance(G, route, req.surface)
    if req.surface != "any" and matched < dist * MIN_SURFACE_SHARE:
        raise HTTPException(
            status_code=404,
            detail=f"No {SURFACE_LABELS[req.surface]} route available here. "
                   f"Try another start point or route type.",
        )

    coords = route_coordinates(G, route)

    return RouteResponse(
        coordinates=coords,
        actual_distance_m=dist,
        target_distance_m=req.target_distance_m,
        footpath_distance_m=footpath_distance(G, route),
        surface_distance_m=matched,
    )