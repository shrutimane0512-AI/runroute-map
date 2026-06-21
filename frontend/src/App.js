import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41]
});
const endIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41]
});

function LocationPicker({ pickMode, onPickStart, onPickEnd }) {
  useMapEvents({
    click(e) {
      if (pickMode === 'start') onPickStart(e.latlng);
      else if (pickMode === 'end') onPickEnd(e.latlng);
    }
  });
  return null;
}

function DirectionArrows({ positions }) {
  if (!positions || positions.length < 2) return null;
  const arrowEvery = Math.max(1, Math.floor(positions.length / 8));
  const arrows = [];

  for (let i = arrowEvery; i < positions.length - 1; i += arrowEvery) {
    const [lat1, lon1] = positions[i - 1];
    const [lat2, lon2] = positions[i];
    const angle = (Math.atan2(lon2 - lon1, lat2 - lat1) * 180) / Math.PI;

    const arrowIcon = L.divIcon({
      className: 'direction-arrow',
      html: `<div style="transform: rotate(${angle}deg); font-size: 22px; color: #2563eb; line-height: 1; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.3));">&#9650;</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    arrows.push(<Marker key={i} position={positions[i]} icon={arrowIcon} interactive={false} />);
  }
  return arrows;
}

function App() {
  const [pickMode, setPickMode] = useState('start');
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [sameStartEnd, setSameStartEnd] = useState(true);
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
      const body = {
        start_lat: start.lat,
        start_lon: start.lng,
        target_distance_m: distance
      };
      if (!sameStartEnd && end) {
        body.end_lat = end.lat;
        body.end_lon = end.lng;
      }

      const res = await fetch('http://localhost:8000/generate-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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

  const canGenerate = start && (sameStartEnd || end) && !loading;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* LEFT SIDEBAR */}
      <div style={{
        width: 380,
        flexShrink: 0,
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        padding: '32px 28px',
        overflowY: 'auto',
        boxShadow: '2px 0 8px rgba(0,0,0,0.04)'
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
          RunRoute
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 28px' }}>
          Generate a running route on the map
        </p>

        {/* Mode toggle */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 16, fontWeight: 500, color: '#0f172a', cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={sameStartEnd}
              onChange={e => {
                setSameStartEnd(e.target.checked);
                setPickMode('start');
                if (e.target.checked) setEnd(null);
              }}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            Loop route (same start &amp; end)
          </label>
        </div>

        {/* Point selection */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            {sameStartEnd ? 'Start point' : 'Route points'}
          </div>

          {sameStartEnd ? (
            <div style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: start ? '#f0fdf4' : '#f8fafc',
              border: `1.5px solid ${start ? '#86efac' : '#e2e8f0'}`,
              fontSize: 15,
              color: start ? '#15803d' : '#94a3b8'
            }}>
              {start ? '✓ Start point set — click map to change' : 'Click the map to set your start point'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => setPickMode('start')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 18px',
                  borderRadius: 10,
                  border: pickMode === 'start' ? '2px solid #16a34a' : '1.5px solid #e2e8f0',
                  background: pickMode === 'start' ? '#f0fdf4' : '#fff',
                  fontSize: 16, fontWeight: 600,
                  color: '#0f172a',
                  cursor: 'pointer'
                }}
              >
                <span>🟢 Set Start Point</span>
                {start && <span style={{ color: '#16a34a' }}>✓</span>}
              </button>
              <button
                onClick={() => setPickMode('end')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 18px',
                  borderRadius: 10,
                  border: pickMode === 'end' ? '2px solid #dc2626' : '1.5px solid #e2e8f0',
                  background: pickMode === 'end' ? '#fef2f2' : '#fff',
                  fontSize: 16, fontWeight: 600,
                  color: '#0f172a',
                  cursor: 'pointer'
                }}
              >
                <span>🔴 Set End Point</span>
                {end && <span style={{ color: '#dc2626' }}>✓</span>}
              </button>
            </div>
          )}
        </div>

        {/* Distance slider */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Target distance
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
            {(distance / 1000).toFixed(1)} <span style={{ fontSize: 18, fontWeight: 500, color: '#64748b' }}>km</span>
          </div>
          <input
            type="range"
            min="1000"
            max="15000"
            step="500"
            value={distance}
            onChange={e => setDistance(Number(e.target.value))}
            style={{ width: '100%', height: 8, cursor: 'pointer', accentColor: '#2563eb' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            <span>1 km</span>
            <span>15 km</span>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          style={{
            width: '100%',
            padding: '18px',
            borderRadius: 12,
            border: 'none',
            background: canGenerate ? '#2563eb' : '#cbd5e1',
            color: '#fff',
            fontSize: 17,
            fontWeight: 700,
            cursor: canGenerate ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s'
          }}
        >
          {loading ? 'Generating route…' : 'Generate Route'}
        </button>

        {/* Result / error */}
        {actualDistance && (
          <div style={{
            marginTop: 20, padding: '16px 18px', borderRadius: 10,
            background: '#eff6ff', border: '1.5px solid #bfdbfe'
          }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 2 }}>Actual route distance</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8' }}>
              {(actualDistance / 1000).toFixed(2)} km
            </div>
          </div>
        )}
        {error && (
          <div style={{
            marginTop: 20, padding: '14px 16px', borderRadius: 10,
            background: '#fef2f2', border: '1.5px solid #fecaca',
            color: '#dc2626', fontSize: 14
          }}>
            {error}
          </div>
        )}
      </div>

      {/* MAP */}
      <div style={{ flex: 1 }}>
        <MapContainer center={[18.5204, 73.8567]} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          <LocationPicker
            pickMode={sameStartEnd ? 'start' : pickMode}
            onPickStart={setStart}
            onPickEnd={setEnd}
          />
          {start && <Marker position={start} icon={startIcon} />}
          {!sameStartEnd && end && <Marker position={end} icon={endIcon} />}
          {route && <Polyline positions={route} color="#2563eb" weight={5} />}
          {route && <DirectionArrows positions={route} />}
        </MapContainer>
      </div>
    </div>
  );
}

export default App;