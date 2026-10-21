import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, Rectangle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const PUNE_CENTER = [18.5204, 73.8567];
const ROUTE_COLOR = '#ea580c';

const ROUTE_TYPES = [
  { value: 'any', icon: '🗺️', label: 'Any', hint: 'Best mix of everything' },
  { value: 'road', icon: '🛣️', label: 'Concrete roads', hint: 'Smooth, regular streets' },
  { value: 'footpath', icon: '🌳', label: 'Footpaths', hint: 'Walkways & trails' },
  { value: 'grass', icon: '🌱', label: 'Grass', hint: 'Soft, low-impact turf' },
  { value: 'dirt', icon: '🟤', label: 'Dirt', hint: 'Earth & unpaved trails' }
];

// Grass and dirt results show their own share; other types show footpath vs road
const NATURAL_SURFACES = ['grass', 'dirt'];

const DISTANCE_PRESETS = [3000, 5000, 10000, 15000];

const PACES = [
  { value: 420, label: 'Easy', sub: '7:00/km' },
  { value: 360, label: 'Steady', sub: '6:00/km' },
  { value: 300, label: 'Fast', sub: '5:00/km' }
];

// Rough running cost for a ~70 kg runner
const KCAL_PER_KM = 70;

const pinIcon = (label, modifier) => L.divIcon({
  className: 'pin-icon',
  html: `<div class="pin pin-${modifier}">${label}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});
const startIcon = pinIcon('S', 'start');
const finishIcon = pinIcon('F', 'finish');

function RouteIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16" />
    </svg>
  );
}

function LocationPicker({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng);
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
      className: 'pin-icon',
      html: `<div class="arrow" style="transform: rotate(${angle}deg)">&#9650;</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    arrows.push(<Marker key={i} position={positions[i]} icon={arrowIcon} interactive={false} />);
  }
  return arrows;
}

// Shade everything outside the area the backend has map data for
function CoverageMask({ coverage }) {
  const { south, west, north, east } = coverage;
  const world = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
  const area = [[south, west], [south, east], [north, east], [north, west]];
  return (
    <>
      <Polygon
        positions={[world, area]}
        pathOptions={{ stroke: false, fillColor: '#0f172a', fillOpacity: 0.16 }}
        interactive={false}
      />
      <Rectangle
        bounds={[[south, west], [north, east]]}
        pathOptions={{ color: '#0f766e', weight: 2, dashArray: '6 6', fill: false }}
        interactive={false}
      />
    </>
  );
}

function FitToRoute({ positions }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(positions, { padding: [48, 48] });
  }, [map, positions]);
  return null;
}

// Leaflet caches its container size, so re-measure whenever the layout changes it
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function isInCoverage(latlng, coverage) {
  if (!coverage) return true;
  return latlng.lat >= coverage.south && latlng.lat <= coverage.north &&
    latlng.lng >= coverage.west && latlng.lng <= coverage.east;
}

function formatCoords(latlng) {
  return `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
}

function formatDuration(seconds) {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = String(totalMin % 60).padStart(2, '0');
  return `${h} h ${m}`;
}

function toGpx(coords, name) {
  const points = coords
    .map(([lat, lon]) => `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailGen" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

function downloadFile(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const SERVER_STATUS = {
  waking: 'Waking up route server…',
  online: 'Route server online',
  offline: 'Route server unreachable'
};

function App() {
  const [map, setMap] = useState(null);
  const [server, setServer] = useState('waking');
  const [coverage, setCoverage] = useState(null);
  const [pickMode, setPickMode] = useState('start');
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [sameStartEnd, setSameStartEnd] = useState(true);
  const [surface, setSurface] = useState('any');
  const [distance, setDistance] = useState(5000);
  const [pace, setPace] = useState(360);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const resultRef = useRef(null);

  // The result card sits below the fold on most screens, so bring it into view
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [result]);

  // Doubles as a wake-up call: Render's free tier sleeps when idle
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/coverage`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        setCoverage(data);
        setServer('online');
      })
      .catch(() => {
        if (!cancelled) setServer('offline');
      });
    return () => { cancelled = true; };
  }, []);

  const placePoint = (latlng, which) => {
    if (!isInCoverage(latlng, coverage)) {
      setNotice('That spot is outside the area TrailGen has map data for. Pick a point inside the highlighted box.');
      return;
    }
    setNotice(null);
    setResult(null);
    if (which === 'start') {
      setStart(latlng);
      if (!sameStartEnd && !end) setPickMode('end');
    } else {
      setEnd(latlng);
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setNotice('Your browser does not support location access. Tap the map instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!isInCoverage(latlng, coverage)) {
          setNotice("You're outside the area TrailGen covers (central Pune). Tap the map inside the highlighted box instead.");
          return;
        }
        placePoint(latlng, 'start');
        if (map) map.flyTo(latlng, 15);
      },
      () => {
        setLocating(false);
        setNotice("Couldn't get your location. Check location permissions, or tap the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleModeChange = loop => {
    setSameStartEnd(loop);
    setPickMode('start');
    setResult(null);
    if (loop) setEnd(null);
  };

  const handleReset = () => {
    setStart(null);
    setEnd(null);
    setResult(null);
    setError(null);
    setNotice(null);
    setPickMode('start');
  };

  const handleGenerate = async () => {
    if (!start) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        start_lat: start.lat,
        start_lon: start.lng,
        target_distance_m: distance,
        surface
      };
      if (!sameStartEnd && end) {
        body.end_lat = end.lat;
        body.end_lon = end.lng;
      }

      const res = await fetch(`${API_URL}/generate-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.status === 404) {
        // the server found no route of the chosen type near this start point
        const data = await res.json().catch(() => ({}));
        const label = ROUTE_TYPES.find(t => t.value === surface).label.toLowerCase();
        setResult(null);
        setError(data.detail || `No ${label} route available here. Try another start point or route type.`);
        return;
      }
      if (!res.ok) {
        throw new Error(res.status >= 500
          ? "Couldn't build a route from here. Try moving your start point or changing the distance."
          : `Request failed (${res.status}).`);
      }
      setResult({ ...(await res.json()), surface });
      setServer('online');
    } catch (err) {
      if (err instanceof TypeError) {
        // fetch rejects with a TypeError when the server can't be reached at all
        setServer('offline');
        setError("Can't reach the route server. If the site has been idle it may still be waking up, so try again in a minute.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const canGenerate = start && (sameStartEnd || end) && !loading;

  let hint = null;
  if (!start) hint = 'Tap the map to set your start point';
  else if (!sameStartEnd && !end) hint = 'Now tap the map to set your finish point';
  else if (!result && !loading) hint = 'All set. Hit Generate Route';

  const routeKm = result ? result.actual_distance_m / 1000 : 0;
  const targetKm = result ? result.target_distance_m / 1000 : 0;
  const natural = result && NATURAL_SURFACES.includes(result.surface);
  const naturalLabel = natural ? ROUTE_TYPES.find(t => t.value === result.surface).label : null;
  const footKm = result
    ? (natural ? result.surface_distance_m : result.footpath_distance_m) / 1000
    : 0;
  const footShare = result && result.actual_distance_m > 0 ? footKm * 1000 / result.actual_distance_m : 0;
  const deltaKm = routeKm - targetKm;

  return (
    <div className="app">

      {/* HEADER */}
      <header className="brand">
        <div className="brand-art"><RouteIcon size={180} /></div>
        <div className="brand-row">
          <div className="logo"><RouteIcon /></div>
          <h1>TrailGen</h1>
        </div>
        <p className="brand-tagline">
          Running routes around Pune, shaped to your distance and the ground you like to run on.
        </p>
        <div className={`status status-${server}`}>
          <span className="status-dot" />
          {SERVER_STATUS[server]}
        </div>
      </header>

      {/* CONTROLS */}
      <main className="panel">

        <section>
          <div className="step-head">
            <span className="step-num">1</span>
            <span className="step-title">Start &amp; finish</span>
          </div>

          <div className="segmented">
            <button className={sameStartEnd ? 'active' : ''} onClick={() => handleModeChange(true)}>
              🔁 Loop
            </button>
            <button className={!sameStartEnd ? 'active' : ''} onClick={() => handleModeChange(false)}>
              📍 A to B
            </button>
          </div>

          <div className="points">
            <button
              className={`point ${!sameStartEnd && pickMode === 'start' ? 'active' : ''}`}
              onClick={() => setPickMode('start')}
            >
              <span className="point-dot point-start">S</span>
              <span>
                <span className="point-label">{sameStartEnd ? 'Start & finish' : 'Start point'}</span>
                <span className="point-sub">{start ? formatCoords(start) : 'Tap the map to set'}</span>
              </span>
              {start && <span className="point-check">✓</span>}
            </button>

            {!sameStartEnd && (
              <button
                className={`point ${pickMode === 'end' ? 'active' : ''}`}
                onClick={() => setPickMode('end')}
              >
                <span className="point-dot point-finish">F</span>
                <span>
                  <span className="point-label">Finish point</span>
                  <span className="point-sub">{end ? formatCoords(end) : 'Tap the map to set'}</span>
                </span>
                {end && <span className="point-check">✓</span>}
              </button>
            )}
          </div>

          <button className="link-btn" onClick={handleLocate} disabled={locating}>
            {locating ? 'Finding you…' : '◎ Use my location as start'}
          </button>
        </section>

        <section>
          <div className="step-head">
            <span className="step-num">2</span>
            <span className="step-title">Route type</span>
          </div>
          <div className="types">
            {ROUTE_TYPES.map(opt => (
              <button
                key={opt.value}
                className={`type ${surface === opt.value ? 'active' : ''}`}
                onClick={() => { setSurface(opt.value); setResult(null); }}
              >
                <span className="type-icon">{opt.icon}</span>
                <span className="type-label">{opt.label}</span>
                <span className="type-hint">{opt.hint}</span>
              </button>
            ))}
          </div>
          <p className="fine-print">Routes favour this type but may use others to connect.</p>
        </section>

        <section>
          <div className="step-head">
            <span className="step-num">3</span>
            <span className="step-title">Distance</span>
          </div>
          <div className="distance-value">
            {(distance / 1000).toFixed(1)}<small>km</small>
          </div>
          <div className="presets">
            {DISTANCE_PRESETS.map(d => (
              <button
                key={d}
                className={`preset ${distance === d ? 'active' : ''}`}
                onClick={() => { setDistance(d); setResult(null); }}
              >
                {d / 1000}K
              </button>
            ))}
          </div>
          <input
            type="range"
            min="1000"
            max="15000"
            step="500"
            value={distance}
            onChange={e => { setDistance(Number(e.target.value)); setResult(null); }}
          />
          <div className="range-ends">
            <span>1 km</span>
            <span>15 km</span>
          </div>
        </section>

        <section>
          <button className="generate" onClick={handleGenerate} disabled={!canGenerate}>
            {loading ? <><span className="spinner" /> Building your route…</> : 'Generate Route'}
          </button>
          {!start && <p className="fine-print center">Set a start point on the map to begin.</p>}
        </section>

        {notice && <div className="alert alert-info">{notice}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {result && (
          <section className="result" ref={resultRef}>
            <div className="result-head">
              <div className="result-label">Your route</div>
              <div className="result-distance">{routeKm.toFixed(2)} km</div>
              <div className="result-delta">
                {Math.abs(deltaKm) / targetKm < 0.05
                  ? `Right on your ${targetKm.toFixed(1)} km target`
                  : `${deltaKm > 0 ? '+' : '−'}${Math.abs(deltaKm).toFixed(2)} km vs your ${targetKm.toFixed(1)} km target`}
              </div>
            </div>

            <div className="stats">
              <div className="stat">
                <div className="stat-value">{formatDuration(routeKm * pace)}</div>
                <div className="stat-label">Est. time</div>
              </div>
              <div className="stat">
                <div className="stat-value">{Math.round(routeKm * KCAL_PER_KM)}</div>
                <div className="stat-label">≈ kcal</div>
              </div>
              <div className="stat">
                <div className="stat-value">{Math.round(footShare * 100)}%</div>
                <div className="stat-label">{natural ? naturalLabel : 'Footpath'}</div>
              </div>
            </div>

            <div className="result-section">
              <div className="mini-title">Your pace</div>
              <div className="segmented compact">
                {PACES.map(p => (
                  <button key={p.value} className={pace === p.value ? 'active' : ''} onClick={() => setPace(p.value)}>
                    {p.label} <span className="pace-sub">{p.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="result-section">
              <div className="mini-title">Surface breakdown</div>
              <div className="surface-bar">
                <div className="foot" style={{ width: `${footShare * 100}%` }} />
                <div className="road" style={{ width: `${(1 - footShare) * 100}%` }} />
              </div>
              <div className="legend">
                <span><i className="foot" />{natural ? naturalLabel : 'Footpath'} {footKm.toFixed(1)} km</span>
                <span><i className="road" />{natural ? 'Other' : 'Road'} {(routeKm - footKm).toFixed(1)} km</span>
              </div>
            </div>

            <div className="result-actions">
              <button
                className="btn btn-primary"
                onClick={() => downloadFile(
                  toGpx(result.coordinates, `TrailGen ${routeKm.toFixed(1)} km`),
                  `trailgen-${routeKm.toFixed(1)}km.gpx`
                )}
              >
                ⬇ Download GPX
              </button>
              <button className="btn" onClick={handleReset}>Start over</button>
            </div>
          </section>
        )}

        <footer className="about">
          <strong>How it works:</strong> TrailGen snaps your points to the nearest walkable street, then
          builds a route that hits your distance without running the same stretch twice. Export the GPX
          to load it into Strava, Garmin or your watch app.
          <div className="about-meta">Covers central Pune · Map data © OpenStreetMap contributors</div>
        </footer>
      </main>

      {/* MAP */}
      <div className="map-wrap">
        {hint && <div className="map-chip">{hint}</div>}
        {loading && (
          <div className="map-loading">
            <div className="map-loading-card"><span className="spinner dark" /> Building your route…</div>
          </div>
        )}
        <div className="map-legend">
          <span><i className="legend-route" />Route</span>
          <span><i className="legend-area" />Coverage area</span>
        </div>

        <MapContainer ref={setMap} center={PUNE_CENTER} zoom={14}>
          <MapResizer />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
          {coverage && <CoverageMask coverage={coverage} />}
          <LocationPicker onPick={latlng => placePoint(latlng, sameStartEnd ? 'start' : pickMode)} />
          {result && (
            <>
              <Polyline positions={result.coordinates} pathOptions={{ color: '#ffffff', weight: 10, opacity: 0.9 }} />
              <Polyline positions={result.coordinates} pathOptions={{ color: ROUTE_COLOR, weight: 5 }} />
              <DirectionArrows positions={result.coordinates} />
              <FitToRoute positions={result.coordinates} />
            </>
          )}
          {start && <Marker position={start} icon={startIcon} />}
          {!sameStartEnd && end && <Marker position={end} icon={finishIcon} />}
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
