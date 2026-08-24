# Volara Radar

A FlightRadar24-inspired live radar for VATSIM. The browser receives traffic through a WebSocket connection; it does not poll VATSIM itself. Aircraft positions are interpolated client-side between authoritative VATSIM feed updates so markers move continuously instead of jumping between snapshots.

## Current features

- Live VATSIM pilot and controller data
- WebSocket broadcast from one backend ingestion loop
- Smooth client-side aircraft interpolation
- MapLibre GL map
- Search by callsign, CID, aircraft type, departure and destination
- Aircraft detail panel
- VATSIM flight-plan route display
- OpenWeather integration for selected aircraft
- Responsive FlightRadar24-inspired dark UI
- API/provider boundaries ready for IVAO and local simulator telemetry

## Run locally

Requirements: Node.js 20+.

```bash
cp .env.example .env
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

Open `http://localhost:5173`.

Set `OPENWEATHER_API_KEY` in `.env` if you want weather in the aircraft panel. The radar itself does not require a weather key.

## Production

The frontend is a static Vite application, while the backend must run as a persistent Node service because the live WebSocket and VATSIM ingestion loop cannot run on GitHub Pages alone. Deploy `server` to a WebSocket-capable host and set `VITE_API_URL` when building the client.

Example:

```bash
npm run build
npm --prefix server run start
```

## Realtime behaviour

VATSIM's public data feed is the authoritative source and has its own publication cadence. Volara Radar fetches that feed on a controlled interval and immediately pushes each new snapshot over WebSocket. The browser then interpolates latitude, longitude and heading every animation frame. This makes movement visually continuous while remaining honest about the source data's actual update cadence.

## Planned provider architecture

Traffic sources should implement a common provider interface so VATSIM, IVAO, MSFS 2020/2024 and X-Plane 11/12 can be added without changing the radar UI. Offline simulator telemetry must use a local bridge/plugin because a normal website cannot directly read simulator state from another computer.

## Important data/legal notes

Use only permitted official/public APIs and feeds. Do not scrape protected services or redistribute copyrighted aircraft photographs without permission. JetPhotos integration should only be enabled through an approved/licensed API or embed mechanism.
