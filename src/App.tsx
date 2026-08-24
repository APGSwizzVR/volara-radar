import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';

type FlightPlan = {
  departure?: string;
  arrival?: string;
  route?: string;
  aircraft?: string;
  aircraft_short?: string;
  assigned_transponder?: string;
};

type Pilot = {
  cid: number;
  callsign: string;
  latitude: number;
  longitude: number;
  altitude: number;
  groundspeed: number;
  heading: number;
  transponder?: string;
  last_updated?: string;
  flight_plan?: FlightPlan | null;
};

type Controller = { callsign: string; frequency: string; facility: number };
type Feed = { pilots: Pilot[]; controllers: Controller[]; general?: { update_timestamp?: string } };
type Track = Pilot & { previousLat: number; previousLon: number; receivedAt: number };

const FEED_URL = 'https://data.vatsim.net/v3/vatsim-data.json';
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const POLL_MS = 15_000;

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanCallsign(value: string) {
  return value.trim().toUpperCase();
}

function aircraftType(pilot: Pilot) {
  return pilot.flight_plan?.aircraft_short || pilot.flight_plan?.aircraft || 'Aircraft';
}

function makePlaneElement(pilot: Pilot, selected: boolean) {
  const el = document.createElement('button');
  el.className = `aircraft-marker ${selected ? 'selected' : ''}`;
  el.type = 'button';
  el.title = `${cleanCallsign(pilot.callsign)} · ${aircraftType(pilot)}`;
  el.innerHTML = `<span class="plane-icon">✈</span><span class="marker-label">${escapeHtml(cleanCallsign(pilot.callsign))}</span>`;
  el.style.setProperty('--heading', `${num(pilot.heading)}deg`);
  return el;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] || char);
}

function formatAlt(value: number) {
  return `${Math.round(num(value)).toLocaleString()} ft`;
}

function formatSpeed(value: number) {
  return `${Math.round(num(value))} kt`;
}

function ageSeconds(timestamp: number) {
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

export default function App() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<number, Marker>());
  const animationRef = useRef<number | null>(null);
  const targetRef = useRef(new Map<number, Pilot>());
  const renderedRef = useRef(new Map<number, { lat: number; lon: number }>());

  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [selected, setSelected] = useState<Pilot | null>(null);
  const [query, setQuery] = useState('');
  const [connected, setConnected] = useState(false);
  const [feedTime, setFeedTime] = useState(0);
  const [lastPoll, setLastPoll] = useState(0);
  const [error, setError] = useState('');
  const [layersOpen, setLayersOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [source, setSource] = useState<'VATSIM' | 'IVAO'>('VATSIM');

  const ingest = useCallback((feed: Feed) => {
    const next = (feed.pilots || []).filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))).map((p) => ({
      ...p,
      cid: num(p.cid),
      latitude: num(p.latitude),
      longitude: num(p.longitude),
      altitude: num(p.altitude),
      groundspeed: num(p.groundspeed),
      heading: num(p.heading),
    }));
    targetRef.current.clear();
    for (const pilot of next) targetRef.current.set(pilot.cid, pilot);
    setPilots(next);
    setControllers(feed.controllers || []);
    setFeedTime(feed.general?.update_timestamp ? Date.parse(feed.general.update_timestamp) : Date.now());
    setLastPoll(Date.now());
    setConnected(true);
    setError('');
  }, []);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`VATSIM feed returned HTTP ${response.status}`);
      ingest((await response.json()) as Feed);
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : 'Unable to load VATSIM data');
    }
  }, [ingest]);

  useEffect(() => {
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: MAP_STYLE,
      center: [-3.7, 54.8],
      zoom: 4.3,
      attributionControl: true,
      antialias: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');
    mapRef.current = map;
    return () => {
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const animate = () => {
      for (const [cid, target] of targetRef.current) {
        const current = renderedRef.current.get(cid) || { lat: target.latitude, lon: target.longitude };
        const next = {
          lat: current.lat + (target.latitude - current.lat) * 0.055,
          lon: current.lon + (target.longitude - current.lon) * 0.055,
        };
        renderedRef.current.set(cid, next);
        markersRef.current.get(cid)?.setLngLat([next.lon, next.lat]);
      }
      for (const cid of [...renderedRef.current.keys()]) {
        if (!targetRef.current.has(cid)) renderedRef.current.delete(cid);
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const active = new Set(pilots.map((p) => p.cid));
    for (const [cid, marker] of markersRef.current) {
      if (!active.has(cid)) {
        marker.remove();
        markersRef.current.delete(cid);
      }
    }
    for (const pilot of pilots) {
      let marker = markersRef.current.get(pilot.cid);
      if (!marker) {
        const el = makePlaneElement(pilot, selected?.cid === pilot.cid);
        el.onclick = () => setSelected(pilot);
        marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([pilot.longitude, pilot.latitude]).addTo(map);
        markersRef.current.set(pilot.cid, marker);
        renderedRef.current.set(pilot.cid, { lat: pilot.latitude, lon: pilot.longitude });
      }
      const el = marker.getElement();
      el.classList.toggle('selected', selected?.cid === pilot.cid);
      el.classList.toggle('hide-label', !showLabels);
      el.style.setProperty('--heading', `${num(pilot.heading)}deg`);
      el.title = `${cleanCallsign(pilot.callsign)} · ${aircraftType(pilot)}`;
    }
  }, [pilots, selected, showLabels]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pilots;
    return pilots.filter((pilot) => {
      const fields = [
        pilot.callsign,
        pilot.flight_plan?.departure,
        pilot.flight_plan?.arrival,
        pilot.flight_plan?.aircraft_short,
        pilot.flight_plan?.aircraft,
        String(pilot.cid),
      ];
      return fields.some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [pilots, query]);

  const focus = (pilot: Pilot) => {
    setSelected(pilot);
    mapRef.current?.flyTo({ center: [pilot.longitude, pilot.latitude], zoom: 7, duration: 800 });
  };

  const route = selected?.flight_plan?.route || 'No route supplied';
  const departure = selected?.flight_plan?.departure || '----';
  const arrival = selected?.flight_plan?.arrival || '----';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-v">V</span><span>VOLARA <strong>RADAR</strong></span></div>
        <div className="searchbox"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search callsign, aircraft, airport or CID" /><kbd>Ctrl K</kbd></div>
        <div className="top-actions"><button onClick={() => setLayersOpen((v) => !v)}>Layers</button><span className={`live-indicator ${connected ? '' : 'off'}`} /><span>{connected ? 'LIVE' : 'OFFLINE'}</span></div>
      </header>

      <aside className="left-panel">
        <div className="panel-heading">LIVE TRAFFIC</div>
        <div className="source-tabs"><button className={source === 'VATSIM' ? 'active' : ''} onClick={() => setSource('VATSIM')}>VATSIM <b>{source === 'VATSIM' ? pilots.length.toLocaleString() : '—'}</b></button><button className={source === 'IVAO' ? 'active' : ''} onClick={() => setSource('IVAO')}>IVAO <b>—</b></button></div>
        {source === 'IVAO' ? <div className="empty-source">IVAO support requires a relay/backend. GitHub Pages cannot securely run a persistent IVAO/local-simulator bridge.</div> : <>
          <div className="section-label">QUICK FILTERS</div>
          <button className="filter active">All aircraft <span>{pilots.length}</span></button>
          <button className="filter">Airliners</button><button className="filter">General aviation</button><button className="filter">Helicopters</button>
          <div className="section-label results-title">SEARCH RESULTS</div>
          <div className="results">{filtered.slice(0, 24).map((pilot) => <button className="result" key={pilot.cid} onClick={() => focus(pilot)}><span className="result-plane">✈</span><span><b>{cleanCallsign(pilot.callsign) || 'UNKNOWN'}</b><small>{aircraftType(pilot)} · {pilot.flight_plan?.departure || '----'} → {pilot.flight_plan?.arrival || '----'}</small></span></button>)}</div>
        </>}
      </aside>

      <main ref={mapNode} className="map" />

      {layersOpen && <div className="layers"><div className="panel-heading">MAP LAYERS</div><label><input type="checkbox" checked readOnly /> Aircraft</label><label><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Labels</label><label><input type="checkbox" disabled /> Airports</label><label><input type="checkbox" disabled /> ATC sectors</label><label><input type="checkbox" disabled /> Weather radar</label></div>}

      {selected && <aside className="details">
        <button className="close" onClick={() => setSelected(null)}>×</button>
        <div className="details-live">● {source} LIVE</div>
        <h1>{cleanCallsign(selected.callsign) || 'UNKNOWN'}</h1>
        <div className="aircraft-name">{aircraftType(selected)}</div>
        <div className="route"><strong>{departure}</strong><span>→</span><strong>{arrival}</strong></div>
        <div className="stats">
          <div><small>ALTITUDE</small><b>{formatAlt(selected.altitude)}</b></div>
          <div><small>SPEED</small><b>{formatSpeed(selected.groundspeed)}</b></div>
          <div><small>HEADING</small><b>{Math.round(selected.heading)}°</b></div>
          <div><small>SQUAWK</small><b>{selected.transponder || '----'}</b></div>
          <div><small>CID</small><b>{selected.cid}</b></div>
          <div><small>UPDATED</small><b>{selected.last_updated ? `${ageSeconds(Date.parse(selected.last_updated))}s` : '—'}</b></div>
        </div>
        <div className="info-card"><div className="card-title">FLIGHT PLAN</div><p>{route}</p></div>
        <div className="info-card"><div className="card-title">PHOTO</div><div className="photo-placeholder">Aircraft photography provider not configured on GitHub Pages.</div></div>
      </aside>}

      {error && <div className="error-toast">{error}</div>}
      <footer className="statusbar"><span className={connected ? 'status-live' : ''}>● {connected ? 'LIVE' : 'DISCONNECTED'}</span><span>Aircraft <b>{pilots.length.toLocaleString()}</b></span><span>Controllers <b>{controllers.length.toLocaleString()}</b></span><span>Feed <b>{feedTime ? `${ageSeconds(feedTime)}s ago` : 'waiting'}</b></span><span>Poll <b>{lastPoll ? `${ageSeconds(lastPoll)}s ago` : '—'}</b></span><span className="status-brand">VOLARA RADAR</span></footer>
    </div>
  );
}
