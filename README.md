# Volara Radar

A FlightRadar24-inspired VATSIM live radar frontend designed to deploy directly to GitHub Pages.

## Important architecture note

GitHub Pages is static hosting. It cannot run a Node/Fastify server, a persistent WebSocket server, SimConnect, xPilot/vPilot bridges, or private API keys.

This version therefore uses the public VATSIM Data API directly from the browser. The VATSIM feed itself is regenerated about every 15 seconds, while the UI interpolates aircraft positions continuously with `requestAnimationFrame` so aircraft move smoothly between feed snapshots instead of visually jumping every update.

VATSIM's current public documentation identifies VATSIM as a simulation network and its current pilot clients include vPilot for Microsoft Flight Simulator 2020/2024 and xPilot for X-Plane 11/12. citehttps://vatsim.net/docs/policy/approved-software/

## GitHub Pages

1. Push this repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Push to `main` or run the workflow manually.
5. GitHub will publish the `dist` folder.

For this repository the expected URL is:

`https://apgswizzvr.github.io/volara-radar/`

## Local development

```powershell
npm install
npm run dev
```

Then open the Vite URL shown in PowerShell.

## Production build

```powershell
npm install
npm run build
npm run preview
```

## Why the old grey screen happened

The previous project constructed MapLibre in a way that triggered a `canvasContextAttributes` runtime exception. It also had separate client/server dependency installation, which is why `vite` and `tsx` were initially missing. This project is a single Vite frontend and removes the server dependency from the GitHub Pages build.

## Live data

The application uses the VATSIM v3 live data feed and does not invent aircraft. Aircraft are removed when they disappear from the feed, and the footer shows the age of the latest feed snapshot.

The feed is a snapshot API rather than a browser WebSocket. No GitHub Pages site can turn that source into a true server-pushed stream by itself. The animation layer makes the map visually continuous between snapshots without falsely claiming that VATSIM supplies sub-second position updates.

## IVAO and local simulator tracking

IVAO and offline MSFS 2020/2024, X-Plane 11/12 tracking cannot be implemented solely inside GitHub Pages. Local simulators require a local bridge, and a multi-network product requires a backend relay. The UI includes the source structure for this expansion without pretending those sources are live when they are not connected.

A future relay can expose a WebSocket/SSE endpoint for:

- IVAO
- vPilot / MSFS 2020
- vPilot / MSFS 2024
- xPilot / X-Plane 11
- xPilot / X-Plane 12
- other approved simulator bridges

The frontend should then subscribe to that relay while retaining the same rendering layer.

## Weather and photographs

Do not place private weather/photo API keys in this GitHub Pages repository. A browser-visible key is public. Weather and aircraft-photo providers should be proxied through a backend when authentication is required. The current UI intentionally shows an unconfigured photo state instead of scraping or redistributing copyrighted images.

## VATSIM attribution

Volara Radar is an independent project and is not an official VATSIM product. VATSIM data is simulated network data and should not be presented as real-world aircraft tracking.
