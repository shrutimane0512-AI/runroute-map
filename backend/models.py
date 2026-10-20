from pydantic import BaseModel
from typing import Optional, List, Tuple, Literal


class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    target_distance_m: float
    end_lat: Optional[float] = None
    end_lon: Optional[float] = None
    surface: Literal["any", "road", "footpath"] = "any"


class RouteResponse(BaseModel):
    coordinates: List[Tuple[float, float]]  # [(lat, lon), (lat, lon), ...]
    actual_distance_m: float
    target_distance_m: float
    footpath_distance_m: float


class CoverageResponse(BaseModel):
    south: float
    west: float
    north: float
    east: float