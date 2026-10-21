"""
Downloads the walking network around Pune from OpenStreetMap and saves it to
pune_graph.graphml. Keeps the OSM `surface` tag on edges so the API can route
over grass or dirt.

Usage: python build_graph.py
"""
import osmnx as ox

CENTER = (18.5204, 73.8567)
RADIUS_M = 4000
OUT_PATH = "pune_graph.graphml"

ox.settings.useful_tags_way = list(ox.settings.useful_tags_way) + ["surface"]

G = ox.graph_from_point(CENTER, dist=RADIUS_M, network_type="walk")
ox.save_graphml(G, filepath=OUT_PATH)
print(f"Saved {len(G.nodes)} nodes, {len(G.edges)} edges to {OUT_PATH}")
