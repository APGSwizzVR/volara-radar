import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';

dotenv.config();

type Aircraft = {
  id: string; callsign: string; cid: number; lat: number; lon: number; altitude: number;
  groundspeed: number; heading: number; verticalSpeed: number; squawk: string;
  aircraftType: string; departure: string; destination: string; route: string;
  source: 'VATSIM'; updatedAt: number;
};
type State = { aircraft: Aircraft[]; controllers: number; updatedAt: number };

const PORT = Number(process.env.PORT || 3000);
const DATA_URL = process.env.VATSIM_DATA_URL || 'https://data.vatsim.net/v3/vatsim-data.json';
const clients = new Set<WebSocket>();
let state: State = { aircraft: [], controllers: 0, updatedAt: 0 };
let lastFetch = 0;

function num(v: unknown, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function text(v: unknown) { return typeof v === 'string' ? v : ''; }

async function refresh() {
  const res = await fetch(DATA_URL, { headers: { 'User-Agent': 'Volara-Radar/1.0' } });
  if (!res.ok) throw new Error(`VATSIM returned ${res.status}`);
  const data = await res.json() as any;
  const now = Date.now();
  state = {
    updatedAt: now,
    controllers: Array.isArray(data.controllers) ? data.controllers.length : 0,
    aircraft: (Array.isArray(data.pilots) ? data.pilots : []).map((p: any) => ({
      id: `vatsim:${p.cid}`,
      callsign: text(p.callsign).trim(),
      cid: num(p.cid), lat: num(p.latitude), lon: num(p.longitude), altitude: num(p.altitude),
      groundspeed: num(p.groundspeed), heading: num(p.heading), verticalSpeed: num(p.vertical_speed),
      squawk: text(p.transponder), aircraftType: text(p.flight_plan?.aircraft_short),
      departure: text(p.flight_plan?.departure), destination: text(p.flight_plan?.arrival),
      route: text(p.flight_plan?.route), source: 'VATSIM', updatedAt: now
    })).filter((a: Aircraft) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
  };
  lastFetch = now;
  const payload = JSON.stringify({ type: 'traffic', state });
  for (const ws of clients) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
app.get('/api/health', async () => ({ ok: true, source: 'VATSIM', aircraft: state.aircraft.length, controllers: state.controllers, updatedAt: state.updatedAt }));
app.get('/api/traffic', async () => state);
app.get('/api/weather', async (req, reply) => {
  const q = req.query as { lat?: string; lon?: string };
  const lat = Number(q.lat), lon = Number(q.lon);
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return reply.code(503).send({ error: 'OPENWEATHER_API_KEY is not configured' });
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return reply.code(400).send({ error: 'lat and lon are required' });
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(lat)); url.searchParams.set('lon', String(lon)); url.searchParams.set('appid', key); url.searchParams.set('units', 'metric');
  const res = await fetch(url); const data = await res.json();
  return reply.code(res.ok ? 200 : res.status).send(data);
});

const server = http.createServer(app.server);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => { clients.add(ws); ws.send(JSON.stringify({ type: 'traffic', state })); ws.on('close', () => clients.delete(ws)); });

server.listen(PORT, '0.0.0.0', () => app.log.info(`Volara Radar server listening on ${PORT}`));

async function loop() {
  try { await refresh(); } catch (e) { app.log.error(e); }
  setTimeout(loop, Math.max(3000, 5000 - (Date.now() - lastFetch)));
}
loop();
