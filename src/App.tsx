import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';

type FlightPlan = { departure?: string; arrival?: string; route?: string; aircraft?: string; aircraft_short?: string; assigned_transponder?: string };
type Pilot = {
  cid: number; callsign: string; latitude: number; longitude: number; altitude: number; groundspeed: number; heading: number;
  transponder?: string; last_updated?: string; flight_plan?: FlightPlan | null;
};
type Controller = { callsign: string; frequency: string; facility: number };
type Feed = { pilots: Pilot[]; controllers: Controller[]; general?: { update_timestamp?: string } };

const FEED_URL = 'https://data.vatsim.net/v3/vatsim-data.json';
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const POLL_MS = 15000;
const MEDIA = {
  msfs: 'https://flightsimulator.azureedge.net/wp-content/uploads/2024/06/MSFS2024_June24_TrailerScreenshots_06-1024x576.jpg',
  xplane: 'https://media.invisioncic.com/i333696/monthly_2022_09/63162f812485a0e940d3e260_781423759_Slection_1130.jpg.b05eb92ffc29c1425be7533a5dc02210.jpg.0a1f9dd0a4d1f9abb56f5187a1eb1e4b.jpg'
};

function n(value: unknown, fallback = 0) { const x = Number(value); return Number.isFinite(x) ? x : fallback; }
function callsign(value: string) { return value.trim().toUpperCase(); }
function typeOf(p: Pilot) { return p.flight_plan?.aircraft_short || p.flight_plan?.aircraft || 'Unknown aircraft'; }
function age(timestamp?: string) {
  if (!timestamp) return 0;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 1000)) : 0;
}
function Icon({ name }: { name: 'search' | 'plane' | 'radio' | 'download' | 'layers' | 'crosshair' | 'x' }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plane: <><path d="m3 11 18-5-7 7 4 8-2 .5-5-6-5 2-1.5-2.5 4-2Z"/></>,
    radio: <><path d="M4.9 19.1a10 10 0 0 1 0-14.2"/><path d="M8.4 15.6a5 5 0 0 1 0-7.2"/><circle cx="12" cy="12" r="1"/><path d="M15.6 8.4a5 5 0 0 1 0 7.2"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></>,
    crosshair: <><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
    x: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>
  };
  return <svg {...props}>{paths[name]}</svg>;
}

export default function App() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<number, Marker>>(new Map());

  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [selected, setSelected] = useState<Pilot | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'airliner' | 'general' | 'helicopter'>('all');
  const [tab, setTab] = useState<'tracking' | 'network' | 'downloads'>('tracking');
  const [source, setSource] = useState<'VATSIM' | 'IVAO'>('VATSIM');
  const [labels, setLabels] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [feedTimestamp, setFeedTimestamp] = useState('');
  const [lastPoll, setLastPoll] = useState(0);
  const [error, setError] = useState('');

  const ingest = useCallback((feed: Feed) => {
    const next = (feed.pilots || []).filter(p => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))).map(p => ({
      ...p,
      cid: n(p.cid), latitude: n(p.latitude), longitude: n(p.longitude), altitude: n(p.altitude),
      groundspeed: n(p.groundspeed), heading: n(p.heading)
    }));
    setPilots(next);
    setControllers(feed.controllers || []);
    setFeedTimestamp(feed.general?.update_timestamp || new Date().toISOString());
    setLastPoll(Date.now());
    setConnected(true);
    setError('');
  }, []);

  const poll = useCallback(async () => {
    if (source !== 'VATSIM') return;
    try {
      const response = await fetch(FEED_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('VATSIM feed returned HTTP ' + response.status);
      ingest(await response.json() as Feed);
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : 'Unable to load live traffic');
    }
  }, [ingest, source]);

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
      zoom: 4.2,
      attributionControl: true
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');
    mapRef.current = map;
    return () => {
      markers.current.forEach(m => m.remove());
      markers.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pilots.filter(p => {
      const type = typeOf(p).toLowerCase();
      const isAirliner = /(a3|a32|a33|a34|a35|a38|b7|b73|b74|b75|b76|b77|b78|b79|e17|e19|crj|atr)/i.test(type);
      const isHelicopter = /(h1|h12|h13|h14|h16|helicopter|ec|as)/i.test(type);
      if (filter === 'airliner' && !isAirliner) return false;
      if (filter === 'helicopter' && !isHelicopter) return false;
      if (filter === 'general' && (isAirliner || isHelicopter)) return false;
      if (!q) return true;
      return [p.callsign, p.cid, p.flight_plan?.departure, p.flight_plan?.arrival, p.flight_plan?.route, type]
        .some(v => String(v ?? '').toLowerCase().includes(q));
    });
  }, [filter, pilots, query]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const active = new Set(filtered.map(p => p.cid));
    markers.current.forEach((marker, cid) => {
      if (!active.has(cid)) { marker.remove(); markers.current.delete(cid); }
    });
    filtered.forEach(p => {
      const selectedState = selected?.cid === p.cid;
      let marker = markers.current.get(p.cid);
      if (!marker) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'aircraft-marker' + (selectedState ? ' selected' : '') + (labels ? '' : ' compact');
        element.innerHTML = '<span class="marker-plane">✈</span><span class="marker-label"></span>';
        element.querySelector('.marker-label')!.textContent = callsign(p.callsign);
        element.style.setProperty('--heading', p.heading + 'deg');
        element.onclick = () => setSelected(p);
        marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([p.longitude, p.latitude]).addTo(map);
        markers.current.set(p.cid, marker);
      } else {
        const element = marker.getElement();
        element.className = 'aircraft-marker' + (selectedState ? ' selected' : '') + (labels ? '' : ' compact');
        element.style.setProperty('--heading', p.heading + 'deg');
        element.querySelector('.marker-label')!.textContent = callsign(p.callsign);
        marker.setLngLat([p.longitude, p.latitude]);
      }
    });
  }, [filtered, selected, labels]);

  useEffect(() => {
    if (!selected || !mapRef.current) return;
    mapRef.current.flyTo({ center: [selected.longitude, selected.latitude], zoom: Math.max(mapRef.current.getZoom(), 6.2), duration: 800 });
  }, [selected]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.global-search')?.focus();
      }
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const feedAge = age(feedTimestamp);
  const focus = (p: Pilot) => {
    setSelected(p);
    mapRef.current?.flyTo({ center: [p.longitude, p.latitude], zoom: 7, duration: 750 });
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark">V</div>
        <div><div className="brand-name">VOLARA <strong>RADAR</strong></div><div className="brand-subtitle">FLIGHT OPERATIONS NETWORK</div></div>
      </div>
      <nav className="main-nav">
        <button className={tab === 'tracking' ? 'active' : ''} onClick={() => setTab('tracking')}><Icon name="plane"/> Tracking</button>
        <button className={tab === 'network' ? 'active' : ''} onClick={() => setTab('network')}><Icon name="radio"/> Network</button>
        <button className={tab === 'downloads' ? 'active' : ''} onClick={() => setTab('downloads')}><Icon name="download"/> Client</button>
      </nav>
      <div className="top-actions">
        <span className={connected ? 'connection-pill live' : 'connection-pill'}><span className={connected ? 'status-dot' : 'status-dot off'}/>{connected ? 'LIVE' : 'OFFLINE'}</span>
        <button className="icon-button" onClick={() => setLayersOpen(v => !v)}><Icon name="layers"/></button>
      </div>
    </header>

    {tab === 'tracking' && <main className="tracking-layout">
      <aside className="control-panel">
        <div className="panel-top"><div><span className="eyebrow">LIVE TRAFFIC</span><h1>Tracking</h1></div><div className={connected ? 'feed-badge online' : 'feed-badge'}><span className={connected ? 'status-dot' : 'status-dot off'}/>{connected ? 'Connected' : 'Offline'}</div></div>
        <div className="search-wrap"><Icon name="search"/><input className="global-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search callsign, route or CID"/><kbd>⌘K</kbd></div>
        <div className="source-switch">
          <button className={source === 'VATSIM' ? 'active' : ''} onClick={() => setSource('VATSIM')}>VATSIM <b>{source === 'VATSIM' ? pilots.length : '—'}</b></button>
          <button className={source === 'IVAO' ? 'active' : ''} onClick={() => setSource('IVAO')}>IVAO <b>—</b></button>
        </div>
        {source === 'IVAO' ? <div className="notice-card"><div className="notice-icon"><Icon name="radio"/></div><div><strong>IVAO bridge</strong><p>IVAO and local simulator feeds will connect through the Volara relay instead of directly through this frontend.</p></div></div> :
        <>
          <div className="section-heading"><span>FILTER TRAFFIC</span><small>{filtered.length} visible</small></div>
          <div className="filter-grid">{(['all','airliner','general','helicopter'] as const).map(item =>
            <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item === 'all' ? 'All aircraft' : item[0].toUpperCase() + item.slice(1)}</button>
          )}</div>
          <div className="section-heading results-heading"><span>ACTIVE TRAFFIC</span><small>Live</small></div>
          <div className="traffic-list">
            {filtered.slice(0, 40).map(p => <button key={p.cid} className={selected?.cid === p.cid ? 'traffic-row selected' : 'traffic-row'} onClick={() => focus(p)}>
              <span className="traffic-icon"><Icon name="plane"/></span>
              <span className="traffic-main"><strong>{callsign(p.callsign)}</strong><small>{typeOf(p)}</small></span>
              <span className="traffic-route">{p.flight_plan?.departure || '----'} <i>→</i> {p.flight_plan?.arrival || '----'}</span>
            </button>)}
            {!filtered.length && <div className="empty-state">No aircraft match this search.</div>}
          </div>
        </>}
        <div className="panel-footer"><div><span>AIRCRAFT</span><strong>{pilots.length.toLocaleString()}</strong></div><div><span>CONTROLLERS</span><strong>{controllers.length.toLocaleString()}</strong></div><div><span>FEED</span><strong>{feedAge}s</strong></div></div>
      </aside>

      <section className="map-stage">
        <div ref={mapNode} className="map"/>
        <div className="map-toolbar">
          <button className="map-tool active"><Icon name="crosshair"/> Live</button>
          <button className="map-tool" onClick={() => setLayersOpen(v => !v)}><Icon name="layers"/> Layers</button>
          <button className="map-tool" onClick={() => mapRef.current?.flyTo({ center: [-3.7, 54.8], zoom: 4.2, duration: 700 })}>Reset view</button>
        </div>
        {layersOpen && <div className="layer-popover"><div className="popover-title">MAP DISPLAY</div>
          <label><input type="checkbox" checked readOnly/> Aircraft</label>
          <label><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)}/> Callsign labels</label>
          <label className="disabled"><input type="checkbox" disabled/> Airports <span>Network data</span></label>
          <label className="disabled"><input type="checkbox" disabled/> ATC sectors <span>Coming soon</span></label>
        </div>}
        <div className="map-status"><span><span className={connected ? 'status-dot' : 'status-dot off'}/>{connected ? 'VATSIM live feed' : 'Waiting for feed'}</span><span>Updated {feedAge}s ago</span></div>
        <div className="map-cards"><div className="floating-card"><span>VISIBLE TRAFFIC</span><strong>{filtered.length.toLocaleString()}</strong><small>aircraft</small></div><div className="floating-card"><span>CONTROLLERS</span><strong>{controllers.length.toLocaleString()}</strong><small>online</small></div></div>
      </section>

      {selected && <aside className="flight-drawer">
        <button className="drawer-close" onClick={() => setSelected(null)}><Icon name="x"/></button>
        <div className="drawer-hero"><img src={MEDIA.msfs} alt="Flight simulator scene"/><div className="drawer-overlay"/><div className="drawer-title"><span>LIVE FLIGHT</span><h2>{callsign(selected.callsign)}</h2><p>{typeOf(selected)}</p></div></div>
        <div className="flight-route"><div><span>DEPARTURE</span><strong>{selected.flight_plan?.departure || '----'}</strong></div><div className="route-line">→</div><div><span>ARRIVAL</span><strong>{selected.flight_plan?.arrival || '----'}</strong></div></div>
        <div className="metric-grid">
          <div><span>ALTITUDE</span><strong>{Math.round(selected.altitude).toLocaleString()} ft</strong></div>
          <div><span>SPEED</span><strong>{Math.round(selected.groundspeed)} kt</strong></div>
          <div><span>HEADING</span><strong>{Math.round(selected.heading)}°</strong></div>
          <div><span>SQUAWK</span><strong>{selected.transponder || '----'}</strong></div>
          <div><span>CID</span><strong>{selected.cid}</strong></div>
          <div><span>UPDATED</span><strong>{selected.last_updated ? age(selected.last_updated) + 's' : '—'}</strong></div>
        </div>
        <div className="drawer-section"><div className="drawer-section-title">FLIGHT PLAN</div><div className="route-box">{selected.flight_plan?.route || 'No route supplied'}</div></div>
        <button className="drawer-action" onClick={() => mapRef.current?.flyTo({ center: [selected.longitude, selected.latitude], zoom: 9, duration: 700 })}><Icon name="crosshair"/> Centre on aircraft</button>
      </aside>}
    </main>}

    {tab === 'network' && <main className="content-page">
      <section className="page-hero"><div><span className="eyebrow">VOLARA NETWORK</span><h1>One radar. Every flight.</h1><p>Track connected network traffic, inspect controllers and keep the live operation visible from one clean workspace.</p></div><div className="hero-chip"><span className="status-dot"/> Network monitoring</div></section>
      <div className="stat-grid">
        {[
          ['Tracked aircraft', pilots.length.toLocaleString(), connected ? 'Live feed connected' : 'Feed offline', connected ? 'positive' : 'negative'],
          ['Controllers online', controllers.length.toLocaleString(), 'Active VATSIM facilities', 'neutral'],
          ['Visible now', filtered.length.toLocaleString(), filter === 'all' ? 'No aircraft filter' : 'Filtered traffic', 'neutral'],
          ['Feed latency', feedAge + 's', feedAge < 30 ? 'Within live window' : 'Feed is delayed', feedAge < 30 ? 'positive' : 'negative']
        ].map(card => <div className="stat-card" key={card[0]}><span>{card[0]}</span><strong>{card[1]}</strong><small className={card[3]}>{card[2]}</small></div>)}
      </div>
      <section className="visual-grid">
        <article className="visual-card large"><img src={MEDIA.msfs} alt="Microsoft Flight Simulator scene"/><div className="visual-content"><span>SIMULATOR ECOSYSTEM</span><h2>Built around the way simmers actually fly.</h2><p>Volara's tracking layer is designed to sit above simulator clients and network feeds without faking local telemetry.</p></div></article>
        <article className="visual-card"><img src={MEDIA.xplane} alt="X-Plane cockpit scene"/><div className="visual-content"><span>X-PLANE</span><h2>Native-ready architecture.</h2><p>Keep the same radar experience while simulator bridges provide live position data.</p></div></article>
      </section>
    </main>}

    {tab === 'downloads' && <main className="content-page downloads-page">
      <section className="page-hero compact"><div><span className="eyebrow">VOLARA CLIENT</span><h1>Connect from your simulator.</h1><p>Cross-platform client architecture for Windows x64, Windows ARM64, Linux x64 and macOS.</p></div></section>
      <div className="platform-grid">
        {[
          ['Windows','x64','Windows 10 / 11','Standard desktop build'],
          ['Windows','ARM64','Windows on ARM','Native ARM client'],
          ['Linux','x64','Modern distributions','Portable desktop client'],
          ['macOS','Universal','Apple Silicon + Intel','Universal application']
        ].map(([name, arch, os, detail]) => <article className="platform-card" key={name + arch}>
          <div className="platform-icon">{name === 'macOS' ? '⌘' : name === 'Linux' ? '◉' : '▣'}</div>
          <div className="platform-copy"><span>{name}</span><h2>{arch}</h2><p>{os}</p><small>{detail}</small></div>
          <a href="https://github.com/APGSwizzVR/volara-radar/releases" target="_blank" rel="noreferrer"><Icon name="download"/> Releases</a>
        </article>)}
      </div>
      <div className="download-note"><div className="notice-icon"><Icon name="radio"/></div><div><strong>Client bridge architecture</strong><p>Local MSFS and X-Plane connections should use the Volara client/bridge layer rather than exposing simulator APIs directly to the public radar frontend.</p></div></div>
    </main>}

    {error && <div className="error-toast">{error}</div>}
    <footer className="global-footer"><span>VOLARA RADAR</span><span>LIVE DATA: VATSIM</span><span>MSFS · X-PLANE · MULTI-PLATFORM</span><span>© 2026 VOLARA</span></footer>
  </div>;
}
