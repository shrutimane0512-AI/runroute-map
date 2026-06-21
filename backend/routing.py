import osmnx as ox
import networkx as nx
import numpy as np


def generate_loop_route(G, start_lat, start_lon, target_distance_m, num_waypoints=4, repeat_penalty=3.0):
    """
    Generates one loop route attempt using the given graph G.
    Penalizes edges already used in earlier legs so the route avoids
    retracing the same path, instead of just minimizing total length leg-by-leg.
    """
    start_node = ox.distance.nearest_nodes(G, start_lon, start_lat)

    loop_radius_m = target_distance_m / (2 * np.pi)

    waypoint_nodes = [start_node]
    for angle_deg in np.linspace(0, 360, num_waypoints, endpoint=False)[1:]:
        angle_rad = np.radians(angle_deg)
        dlat = (loop_radius_m * np.cos(angle_rad)) / 111320
        dlon = (loop_radius_m * np.sin(angle_rad)) / (111320 * np.cos(np.radians(start_lat)))
        wp_node = ox.distance.nearest_nodes(G, start_lon + dlon, start_lat + dlat)
        waypoint_nodes.append(wp_node)

    waypoint_nodes.append(start_node)

    # Track how many times each edge has been used so far in this route
    used_edges = {}

    def weight_fn(u, v, edge_data):
        # edge_data can hold multiple parallel edges between u,v (OSMnx multigraph) - take the shortest
        base_length = min(d.get("length", 1) for d in edge_data.values())
        times_used = used_edges.get((u, v), 0) + used_edges.get((v, u), 0)
        return base_length * (repeat_penalty ** times_used)

    full_route = []
    total_length = 0
    for i in range(len(waypoint_nodes) - 1):
        a, b = waypoint_nodes[i], waypoint_nodes[i + 1]
        leg = nx.shortest_path(G, a, b, weight=weight_fn)

        # Compute the *real* length of this leg (not the penalized weight)
        leg_length = sum(
            min(d.get("length", 1) for d in G.get_edge_data(leg[j], leg[j+1]).values())
            for j in range(len(leg) - 1)
        )
        total_length += leg_length

        # Mark these edges as used, so the next leg avoids repeating them
        for j in range(len(leg) - 1):
            edge = (leg[j], leg[j+1])
            used_edges[edge] = used_edges.get(edge, 0) + 1

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


def generate_point_to_point_route(G, start_lat, start_lon, end_lat, end_lon,
                                    target_distance_m, tolerance=0.15, max_attempts=6, repeat_penalty=3.0):
    start_node = ox.distance.nearest_nodes(G, start_lon, start_lat)
    end_node = ox.distance.nearest_nodes(G, end_lon, end_lat)

    direct_route = nx.shortest_path(G, start_node, end_node, weight="length")
    direct_length = nx.shortest_path_length(G, start_node, end_node, weight="length")

    if direct_length >= target_distance_m * (1 - tolerance):
        return direct_route, direct_length

    remaining_distance = target_distance_m - direct_length
    detour_radius_m = remaining_distance / 2

    mid_lat = (start_lat + end_lat) / 2
    mid_lon = (start_lon + end_lon) / 2
    dx = end_lon - start_lon
    dy = end_lat - start_lat
    length = (dx**2 + dy**2) ** 0.5 or 1e-9
    perp_lat = -dx / length
    perp_lon = dy / length

    best_route, best_dist = direct_route, direct_length
    best_error = abs(direct_length - target_distance_m) / target_distance_m

    for attempt in range(max_attempts):
        offset_scale = detour_radius_m * (0.5 + attempt * 0.25)
        detour_lat = mid_lat + (perp_lat * offset_scale) / 111320
        detour_lon = mid_lon + (perp_lon * offset_scale) / (111320 * np.cos(np.radians(mid_lat)))

        try:
            detour_node = ox.distance.nearest_nodes(G, detour_lon, detour_lat)

            used_edges = {}
            def weight_fn(u, v, edge_data):
                base_length = min(d.get("length", 1) for d in edge_data.values())
                times_used = used_edges.get((u, v), 0) + used_edges.get((v, u), 0)
                return base_length * (repeat_penalty ** times_used)

            leg1 = nx.shortest_path(G, start_node, detour_node, weight=weight_fn)
            for j in range(len(leg1) - 1):
                edge = (leg1[j], leg1[j+1])
                used_edges[edge] = used_edges.get(edge, 0) + 1

            leg2 = nx.shortest_path(G, detour_node, end_node, weight=weight_fn)

            leg1_len = sum(min(d.get("length", 1) for d in G.get_edge_data(leg1[j], leg1[j+1]).values()) for j in range(len(leg1)-1))
            leg2_len = sum(min(d.get("length", 1) for d in G.get_edge_data(leg2[j], leg2[j+1]).values()) for j in range(len(leg2)-1))
        except Exception:
            continue

        total_len = leg1_len + leg2_len
        full_route = leg1 + leg2[1:]
        error = abs(total_len - target_distance_m) / target_distance_m

        if error < best_error:
            best_error = error
            best_route, best_dist = full_route, total_len
        if error < tolerance:
            return full_route, total_len

    return best_route, best_dist