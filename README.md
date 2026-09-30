# Volara Radar

Volara Radar is the live traffic/radar frontend for the Volara flight operations network.

## Interface
- Live VATSIM traffic ingestion.
- Smooth MapLibre aircraft tracking.
- Callsign, route and CID search.
- Aircraft type filters.
- Interactive selected-flight drawer.
- Live network statistics.
- Simulator-focused visual dashboard.
- Cross-platform client/download area.
- Responsive layouts.

## Platform target
The Volara client architecture targets Windows x64, Windows ARM64, Linux x64 and macOS Universal (Apple Silicon + Intel).

The public radar frontend does not directly access local simulator APIs. Local MSFS and X-Plane integrations should use a Volara client/bridge and send required telemetry to the network service.

## Simulator targets
- Microsoft Flight Simulator 2020
- Microsoft Flight Simulator 2024
- X-Plane 11
- X-Plane 12
- Other approved simulator bridges

## Development
npm install
npm run dev
npm run build
npm run preview

## Live data
The current public frontend reads the VATSIM v3 feed:
https://data.vatsim.net/v3/vatsim-data.json

The feed is polled every 15 seconds. The UI renders aircraft between feed snapshots rather than inventing aircraft.

## Media
Microsoft Flight Simulator media in the interface is sourced from Microsoft's official screenshot/media material. X-Plane imagery is simulator-context artwork and should be replaced with Volara-owned screenshots when the project has its own media library.

Volara Radar is an independent project and is not an official VATSIM product.
