import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function LocationPicker({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng);
    }
  });
  return null;
}

function App() {
  const [start, setStart] = useState(null);
  const [distance, setDistance] = useState(5000);
  const [route, setRoute] = useState(null);
  const [actualDistance, setActualDistance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!start) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:8000/generate-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: start.lat,
          start_lon: start.lng,
          target_distance_m: distance
        })
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setRoute(data.coordinates);
      setActualDistance(data.actual_distance_m);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ padding: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Click the map to set a start point</span>
        <label>
          Distance: {(distance / 1000).toFixed(1)} km
          <input
            type="range"
            min="1000"
            max="15000"
            step="500"
            value={distance}
            onChange={e => setDistance(Number(e.target.value))}
            style={{ marginLeft: 8 }}
          />
        </label>
        <button onClick={handleGenerate} disabled={!start || loading}>
          {loading ? 'Generating...' : 'Generate Route'}
        </button>
        {actualDistance && (
          <span>Actual: {(actualDistance / 1000).toFixed(2)} km</span>
        )}
        {error && <span style={{ color: 'red' }}>Error: {error}</span>}
      </div>

      <MapContainer center={[18.5204, 73.8567]} zoom={14} style={{ height: '85vh' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <LocationPicker onPick={setStart} />
        {start && <Marker position={start} />}
        {route && <Polyline positions={route} color="blue" weight={4} />}
      </MapContainer>
    </div>
  );
}

export default App;