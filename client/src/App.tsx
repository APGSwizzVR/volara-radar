import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map, Marker } from 'maplibre-gl';

type Aircraft = { id:string; callsign:string; cid:number; lat:number; lon:number; altitude:number; groundspeed:number; heading:number; verticalSpeed:number; squawk:string; aircraftType:string; departure:string; destination:string; route:string; source:string; updatedAt:number };
type State = { aircraft:Aircraft[]; controllers:number; updatedAt:number };
const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const empty:State = { aircraft:[], controllers:0, updatedAt:0 };

function formatAlt(v:number){ return `${Math.round(v).toLocaleString()} ft`; }
function formatSpeed(v:number){ return `${Math.round(v)} kt`; }
function iconHtml(a:Aircraft, selected:boolean){ return `<div class="plane-wrap ${selected?'selected':''}" style="--heading:${a.heading}deg"><div class="plane">✈</div><span>${a.callsign || 'UNKNOWN'}</span></div>`; }

export default function App(){
  const mapEl=useRef<HTMLDivElement>(null); const mapRef=useRef<Map|null>(null); const markers=useRef<Map<string,Marker>>(new Map());
  const [state,setState]=useState<State>(empty); const [selected,setSelected]=useState<Aircraft|null>(null); const [query,setQuery]=useState(''); const [connected,setConnected]=useState(false); const [weather,setWeather]=useState<any>(null); const [layers,setLayers]=useState(true);
  const [display,setDisplay]=useState<Record<string,{lat:number;lon:number;heading:number}>>({});

  useEffect(()=>{ if(!mapEl.current) return; const map=new maplibregl.Map({container:mapEl.current, style:'https://tiles.openfreemap.org/styles/liberty', center:[-3,53], zoom:4}); map.addControl(new maplibregl.NavigationControl(),'bottom-right'); map.addControl(new maplibregl.FullscreenControl(),'bottom-right'); mapRef.current=map; return()=>map.remove(); },[]);

  useEffect(()=>{ const wsUrl=API.replace(/^http/,'ws')+'/ws'; const ws=new WebSocket(wsUrl); ws.onopen=()=>setConnected(true); ws.onclose=()=>setConnected(false); ws.onerror=()=>setConnected(false); ws.onmessage=e=>{ const msg=JSON.parse(e.data); if(msg.type==='traffic') setState(msg.state); }; return()=>ws.close(); },[]);

  useEffect(()=>{ let frame=0; const tick=()=>{ setDisplay(prev=>{ const next={...prev}; for(const a of state.aircraft){ const p=prev[a.id]||{lat:a.lat,lon:a.lon,heading:a.heading}; const k=.12; next[a.id]={lat:p.lat+(a.lat-p.lat)*k,lon:p.lon+(a.lon-p.lon)*k,heading:a.heading}; } return next; }); frame=requestAnimationFrame(tick); }; frame=requestAnimationFrame(tick); return()=>cancelAnimationFrame(frame); },[state.aircraft]);

  useEffect(()=>{ const map=mapRef.current; if(!map) return; for(const [id,m] of markers.current){ if(!state.aircraft.some(a=>a.id===id)){m.remove();markers.current.delete(id);} } for(const a of state.aircraft){ let m=markers.current.get(a.id); const pos=display[a.id]||a; if(!m){ const el=document.createElement('div'); el.innerHTML=iconHtml(a,selected?.id===a.id); el.className='marker-host'; el.onclick=()=>setSelected(a); m=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([pos.lon,pos.lat]).addTo(map); markers.current.set(a.id,m); } else { m.setLngLat([pos.lon,pos.lat]); const el=m.getElement(); el.innerHTML=iconHtml(a,selected?.id===a.id); } } },[state.aircraft,display,selected]);

  useEffect(()=>{ if(!selected) {setWeather(null);return;} fetch(`${API}/api/weather?lat=${selected.lat}&lon=${selected.lon}`).then(r=>r.ok?r.json():null).then(setWeather).catch(()=>setWeather(null)); },[selected]);

  const filtered=useMemo(()=>{ const q=query.trim().toLowerCase(); if(!q)return state.aircraft; return state.aircraft.filter(a=>[a.callsign,a.aircraftType,a.departure,a.destination,String(a.cid)].some(v=>v.toLowerCase().includes(q))); },[state.aircraft,query]);
  const focus=(a:Aircraft)=>{setSelected(a);mapRef.current?.flyTo({center:[a.lon,a.lat],zoom:7,duration:900});};

  return <div className="app">
    <header className="topbar"><div className="brand"><span className="brand-mark">V</span><span>VOLARA <b>RADAR</b></span></div><div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search flights, aircraft, airports..."/><kbd>⌘ K</kbd></div><div className="top-actions"><button onClick={()=>setLayers(v=>!v)}>Layers</button><span className={connected?'live-dot':'offline-dot'}></span><span>{connected?'LIVE':'OFFLINE'}</span></div></header>
    <aside className="left-panel"><div className="panel-title">LIVE TRAFFIC</div><div className="source-row"><span className="source-dot vatsim"></span><span>VATSIM</span><strong>{state.aircraft.length.toLocaleString()}</strong></div><div className="source-row muted"><span className="source-dot iva"></span><span>IVAO</span><strong>—</strong></div><div className="section"><div className="section-label">QUICK FILTERS</div><button className="filter active">All aircraft <span>{state.aircraft.length}</span></button><button className="filter">Airliners</button><button className="filter">General aviation</button><button className="filter">Helicopters</button></div><div className="section"><div className="section-label">SEARCH RESULTS</div><div className="results">{filtered.slice(0,18).map(a=><button className="result" key={a.id} onClick={()=>focus(a)}><span className="result-plane">✈</span><span><b>{a.callsign||'UNKNOWN'}</b><small>{a.aircraftType||'Aircraft'} · {a.departure||'----'} → {a.destination||'----'}</small></span></button>)}</div></div></aside>
    <main ref={mapEl} className="map"></main>
    {layers&&<div className="layers"><div className="panel-title">MAP LAYERS</div><label><input type="checkbox" defaultChecked/> Aircraft</label><label><input type="checkbox"/> Airports</label><label><input type="checkbox"/> ATC</label><label><input type="checkbox"/> Weather</label></div>}
    {selected&&<aside className="details"><button className="close" onClick={()=>setSelected(null)}>×</button><div className="details-source">● {selected.source} LIVE</div><h1>{selected.callsign||'UNKNOWN'}</h1><div className="aircraft-name">{selected.aircraftType||'Aircraft'}</div><div className="route"><span>{selected.departure||'----'}</span><i>→</i><span>{selected.destination||'----'}</span></div><div className="stats"><div><small>ALTITUDE</small><b>{formatAlt(selected.altitude)}</b></div><div><small>SPEED</small><b>{formatSpeed(selected.groundspeed)}</b></div><div><small>HEADING</small><b>{Math.round(selected.heading)}°</b></div><div><small>VERTICAL</small><b>{Math.round(selected.verticalSpeed)} ft/min</b></div><div><small>SQUAWK</small><b>{selected.squawk||'----'}</b></div><div><small>CID</small><b>{selected.cid}</b></div></div><div className="card"><div className="card-title">LIVE WEATHER</div>{weather?<><b>{Math.round(weather.main?.temp)}°C</b><span>{weather.weather?.[0]?.description}</span><span>Wind {Math.round((weather.wind?.speed||0)*1.94384)} kt</span><span>Visibility {((weather.visibility||0)/1000).toFixed(1)} km</span></>:<span>Weather unavailable</span>}</div><div className="card"><div className="card-title">FLIGHT PLAN</div><p>{selected.route||'No route supplied by VATSIM.'}</p></div></aside>}
    <footer className="status"><span>● {connected?'LIVE':'DISCONNECTED'}</span><span>Aircraft <b>{state.aircraft.length.toLocaleString()}</b></span><span>Controllers <b>{state.controllers.toLocaleString()}</b></span><span>VATSIM data <b>{state.updatedAt?`${Math.max(0,Math.round((Date.now()-state.updatedAt)/1000))}s ago`:'waiting'}</b></span><span className="status-right">Volara Radar</span></footer>
  </div>
}
