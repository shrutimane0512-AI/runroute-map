from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import osmnx as ox
import os

from models import RouteRequest, RouteResponse
from routing import generate_loop_route_tuned

app = FastAPI(title="RunRoute API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your frontend's actual URL before sharing publicly
    allow_methods=["*"],
    allow_headers=["*"],
)

GRAPH_PATH = "pune_graph.graphml"
G = None  # loaded at startup


@app.on_event("startup")
def load_graph():
    global G
    if not os.path.exists(GRAPH_PATH):
        raise RuntimeError(
            f"{GRAPH_PATH} not found. Generate it first by running the "
            f"prototype notebook and calling ox.save_graphml(G, '{GRAPH_PATH}')."
        )
    G = ox.load_graphml(GRAPH_PATH)


@app.get("/health")
def health():
    return {"status": "ok", "graph_loaded": G is not None}


@app.post("/generate-route", response_model=RouteResponse)
def generate_route(req: RouteRequest):
    if G is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")

    route, dist = generate_loop_route_tuned(
        G, req.start_lat, req.start_lon, req.target_distance_m
    )

    if route is None:
        raise HTTPException(status_code=500, detail="Could not generate a route for this location")

    coords = [(G.nodes[n]["y"], G.nodes[n]["x"]) for n in route]  # y=lat, x=lon

    return RouteResponse(
        coordinates=coords,
        actual_distance_m=dist,
        target_distance_m=req.target_distance_m,
    )