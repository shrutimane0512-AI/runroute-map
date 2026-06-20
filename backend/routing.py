import osmnx as ox
import networkx as nx
import numpy as np


def generate_loop_route(G, start_lat, start_lon, target_distance_m, num_waypoints=4):
    """
    Generates one loop route attempt using the given graph G.
    Places waypoints in a rough circle around the start point, snaps
    each to the nearest graph node, then stitches shortest paths
    between consecutive waypoints to form a closed loop.
    """
    start_node = ox.distance.nearest_nodes(G, start_lon, start_lat)

    # circumference = 2*pi*r  -->  r = circumference / (2*pi)
    loop_radius_m = target_distance_m / (2 * np.pi)

    waypoint_nodes = [start_node]
    for angle_deg in np.linspace(0, 360, num_waypoints, endpoint=False)[1:]:
        angle_rad = np.radians(angle_deg)
        # crude meters -> lat/lon offset, fine at city scale
        dlat = (loop_radius_m * np.cos(angle_rad)) / 111320
        dlon = (loop_radius_m * np.sin(angle_rad)) / (111320 * np.cos(np.radians(start_lat)))
        wp_lat = start_lat + dlat
        wp_lon = start_lon + dlon
        wp_node = ox.distance.nearest_nodes(G, wp_lon, wp_lat)
        waypoint_nodes.append(wp_node)

    waypoint_nodes.append(start_node)  # close the loop back at start

    full_route = []
    total_length = 0
    for i in range(len(waypoint_nodes) - 1):
        a, b = waypoint_nodes[i], waypoint_nodes[i + 1]
        leg = nx.shortest_path(G, a, b, weight="length")
        leg_length = nx.shortest_path_length(G, a, b, weight="length")
        total_length += leg_length
        # avoid duplicating the shared node between consecutive legs
        full_route.extend(leg if i == 0 else leg[1:])

    return full_route, total_length


def generate_loop_route_tuned(G, start_lat, start_lon, target_distance_m,
                                tolerance=0.15, max_attempts=6, num_waypoints=4):
    """
    Calls generate_loop_route repeatedly, scaling the search radius each
    time to converge on something close to target_distance_m.
    Returns the best attempt even if tolerance isn't hit within max_attempts.
    """
    radius_multiplier = 1.0
    best_route, best_dist = None, None
    best_error = float("inf")

    for attempt in range(max_attempts):
        try:
            route, dist = generate_loop_route(
                G, start_lat, start_lon,
                target_distance_m * radius_multiplier,
                num_waypoints=num_waypoints
            )
        except Exception:
            # nearest_nodes / shortest_path can fail if waypoints fall
            # outside the loaded graph -- shrink and retry
            radius_multiplier *= 0.8
            continue

        error = abs(dist - target_distance_m) / target_distance_m
        if error < best_error:
            best_error = error
            best_route, best_dist = route, dist

        if error < tolerance:
            return route, dist

        # scale toward target for next attempt
        radius_multiplier *= target_distance_m / dist

    return best_route, best_dist