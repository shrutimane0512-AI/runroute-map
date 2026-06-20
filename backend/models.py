from pydantic import BaseModel
from typing import Optional, List, Tuple


class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    target_distance_m: float
    end_lat: Optional[float] = None
    end_lon: Optional[float] = None


class RouteResponse(BaseModel):
    coordinates: List[Tuple[float, float]]  # [(lat, lon), (lat, lon), ...]
    actual_distance_m: float
    target_distance_m: float