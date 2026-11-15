import { useMemo, useState, type FC, type MouseEvent } from 'react';
import { Compass, Crosshair, Layers, Navigation, X } from 'lucide-react';
import { US_AIRPORT_HUBS } from '../lib/stations.ts';
import { US_AIRLINES } from '../lib/airlines.ts';
import { AirlineLogo } from './AirlineLogo.tsx';
import type { LiveFlight, UsAirportHub } from '../types/skypulse.ts';

type UsAirspaceMapProps = {
  selectedHub: UsAirportHub;
  onSelectHub: (hub: UsAirportHub) => void;
  liveFlights: LiveFlight[];
  conusFlights: LiveFlight[];
  selectedFlight: LiveFlight | null;
  onSelectFlight: (flight: LiveFlight | null) => void;
};

// Accurate simplified CONUS geographic coastline + Great Lakes polygon in Lon/Lat projected to 1000x600 SVG
const CONUS_OUTLINE_COORDS: Array<[number, number]> = [
  [-124.6, 48.4], [-123.0, 48.9], [-122.4, 48.0], [-124.2, 46.8], [-124.5, 43.2],
  [-124.3, 41.8], [-123.7, 39.0], [-122.5, 37.8], [-121.9, 36.6], [-120.6, 34.5],
  [-118.4, 33.9], [-117.1, 32.5], [-114.7, 32.7], [-111.0, 31.3], [-108.2, 31.3],
  [-106.5, 31.7], [-104.5, 29.5], [-102.7, 29.8], [-100.8, 28.4], [-97.1, 25.9],
  [-97.2, 27.8], [-95.1, 29.2], [-93.8, 29.7], [-91.2, 29.2], [-89.1, 29.1],
  [-88.8, 30.3], [-85.5, 30.1], [-83.8, 29.9], [-82.7, 27.7], [-81.7, 26.1],
  [-80.2, 25.4], [-80.1, 26.8], [-80.7, 28.6], [-81.4, 30.7], [-80.9, 32.1],
  [-78.9, 33.8], [-76.5, 34.7], [-75.5, 35.6], [-76.0, 36.9], [-75.4, 38.4],
  [-74.0, 40.4], [-71.9, 41.0], [-70.0, 41.7], [-70.7, 42.8], [-68.2, 44.3],
  [-67.0, 45.0], [-67.8, 47.2], [-69.2, 47.4], [-71.5, 45.0], [-74.9, 45.0],
  [-76.5, 44.1], [-79.1, 43.3], [-82.5, 42.0], [-83.1, 43.0], [-82.4, 45.8],
  [-84.7, 46.5], [-87.5, 46.5], [-90.2, 46.8], [-92.1, 46.8], [-95.1, 49.0],
  [-104.0, 49.0], [-115.0, 49.0], [-122.8, 49.0], [-124.6, 48.4],
];

// Major US air corridors for subtle aeronautical navigation reference
const JET_CORRIDORS: Array<[string, string]> = [
  ['SFO', 'DEN'],
  ['DEN', 'ORD'],
  ['ORD', 'JFK'],
  ['JFK', 'BOS'],
  ['SFO', 'LAX'],
  ['LAX', 'DFW'],
  ['DFW', 'ATL'],
  ['ATL', 'MIA'],
  ['ATL', 'JFK'],
  ['SEA', 'SFO'],
  ['SEA', 'DEN'],
  ['DEN', 'DFW'],
  ['ORD', 'ATL'],
];

const HUB_BY_IATA = Object.fromEntries(US_AIRPORT_HUBS.map((h) => [h.iata, h]));

function projectLonLat(lon: number, lat: number, viewMode: 'conus' | 'sector', hub: UsAirportHub): { x: number; y: number } {
  if (viewMode === 'sector') {
    const lonSpan = 7.5;
    const latSpan = 4.6;
    const x = 500 + ((lon - hub.lon) / (lonSpan / 2)) * 450;
    const y = 300 - ((lat - hub.lat) / (latSpan / 2)) * 255;
    return { x, y };
  }

  // Albers-like equirectangular adjusted for CONUS aspect ratio
  const minLon = -126.5;
  const maxLon = -65.5;
  const minLat = 23.5;
  const maxLat = 50.2;
  const x = ((lon - minLon) / (maxLon - minLon)) * 920 + 40;
  const y = ((maxLat - lat) / (maxLat - minLat)) * 520 + 40;
  return { x, y };
}

function unprojectCursor(x: number, y: number, viewMode: 'conus' | 'sector', hub: UsAirportHub): { lat: number; lon: number } {
  if (viewMode === 'sector') {
    const lonSpan = 7.5;
    const latSpan = 4.6;
    const lon = hub.lon + ((x - 500) / 450) * (lonSpan / 2);
    const lat = hub.lat - ((y - 300) / 255) * (latSpan / 2);
    return { lat, lon };
  }
  const minLon = -126.5;
  const maxLon = -65.5;
  const minLat = 23.5;
  const maxLat = 50.2;
  const lon = ((x - 40) / 920) * (maxLon - minLon) + minLon;
  const lat = maxLat - ((y - 40) / 520) * (maxLat - minLat);
  return { lat, lon };
}

export const UsAirspaceMap: FC<UsAirspaceMapProps> = ({
  selectedHub,
  onSelectHub,
  liveFlights,
  conusFlights,
  selectedFlight,
  onSelectFlight,
}) => {
  const [viewMode, setViewMode] = useState<'conus' | 'sector'>('conus');
  const [showCorridors, setShowCorridors] = useState(true);
  const [showCallsigns, setShowCallsigns] = useState(true);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);

  const displayedFlights = useMemo(() => {
    const source = viewMode === 'sector' ? liveFlights : conusFlights;
    return source.slice(0, 140);
  }, [viewMode, liveFlights, conusFlights]);

  const conusPath = useMemo(() => {
    return (
      CONUS_OUTLINE_COORDS.map(([lon, lat], index) => {
        const pt = projectLonLat(lon, lat, viewMode, selectedHub);
        return `${index === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }).join(' ') + ' Z'
    );
  }, [viewMode, selectedHub]);

  const handleSvgMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * 1000;
    const svgY = ((e.clientY - rect.top) / rect.height) * 600;
    setCursorCoords(unprojectCursor(svgX, svgY, viewMode, selectedHub));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0F172A]">
      {/* Map Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            US Airspace Radar
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {displayedFlights.length} active targets · {viewMode === 'conus' ? 'CONUS Sector' : `${selectedHub.iata} 160 nm Terminal`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800/90">
            <button
              type="button"
              onClick={() => setViewMode('conus')}
              className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'conus'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              National CONUS
            </button>
            <button
              type="button"
              onClick={() => setViewMode('sector')}
              className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'sector'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {selectedHub.iata} Terminal
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCorridors((v) => !v)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showCorridors
                ? 'border-sky-500/40 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-950/50 dark:text-sky-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Jetways
          </button>

          <button
            type="button"
            onClick={() => setShowCallsigns((v) => !v)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showCallsigns
                ? 'border-sky-500/40 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-950/50 dark:text-sky-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            Callsigns
          </button>
        </div>
      </div>

      {/* Interactive Radar Viewport */}
      <div className="relative overflow-hidden bg-slate-100/70 dark:bg-[#070B14]">
        <svg
          viewBox="0 0 1000 600"
          className="block h-[420px] w-full cursor-crosshair select-none lg:h-[500px]"
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={() => setCursorCoords(null)}
        >
          <defs>
            <pattern id="radarGrid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                className="stroke-slate-200/80 dark:stroke-slate-800/60"
                strokeWidth="0.75"
              />
            </pattern>
            <clipPath id="airspaceViewportClip">
              <rect x="0" y="0" width="1000" height="600" />
            </clipPath>
          </defs>

          <rect width="1000" height="600" fill="url(#radarGrid)" />

          <g clipPath="url(#airspaceViewportClip)">
            {/* CONUS Landmass Silhouette */}
            <path
              d={conusPath}
              className="fill-white stroke-slate-300 dark:fill-[#111A2E] dark:stroke-slate-700"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />

            {/* Sector Range Rings when zoomed onto a Hub */}
            {viewMode === 'sector' && (
              <g className="stroke-sky-500/25 dark:stroke-sky-400/20" fill="none">
                <circle cx="500" cy="300" r="85" strokeDasharray="4 4" />
                <circle cx="500" cy="300" r="170" strokeDasharray="4 4" />
                <circle cx="500" cy="300" r="255" strokeDasharray="4 4" />
                <text x="588" y="304" className="fill-slate-400 text-[9px] font-mono">45 nm</text>
                <text x="673" y="304" className="fill-slate-400 text-[9px] font-mono">90 nm</text>
                <text x="758" y="304" className="fill-slate-400 text-[9px] font-mono">135 nm</text>
              </g>
            )}

            {/* US Air Corridors */}
            {showCorridors &&
              JET_CORRIDORS.map(([fromCode, toCode]) => {
                const a = HUB_BY_IATA[fromCode];
                const b = HUB_BY_IATA[toCode];
                if (!a || !b) return null;
                const p1 = projectLonLat(a.lon, a.lat, viewMode, selectedHub);
                const p2 = projectLonLat(b.lon, b.lat, viewMode, selectedHub);
                return (
                  <line
                    key={`${fromCode}-${toCode}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    className="stroke-sky-500/20 dark:stroke-sky-400/20"
                    strokeWidth="1"
                    strokeDasharray="3 4"
                  />
                );
              })}

            {/* Major US Hub Airports */}
            {US_AIRPORT_HUBS.map((hub) => {
              const pt = projectLonLat(hub.lon, hub.lat, viewMode, selectedHub);
              if (pt.x < -30 || pt.x > 1030 || pt.y < -30 || pt.y > 630) return null;
              const isSelected = hub.iata === selectedHub.iata;
              return (
                <g
                  key={hub.iata}
                  transform={`translate(${pt.x}, ${pt.y})`}
                  onClick={() => onSelectHub(hub)}
                  className="cursor-pointer"
                >
                  {isSelected && (
                    <circle
                      r="14"
                      className="fill-sky-500/15 stroke-sky-500 dark:fill-sky-400/15 dark:stroke-sky-400"
                      strokeWidth="1.2"
                    />
                  )}
                  <circle
                    r={isSelected ? 5 : 3.5}
                    className={
                      isSelected
                        ? 'fill-sky-600 stroke-white dark:fill-sky-400 dark:stroke-slate-950'
                        : 'fill-slate-500 stroke-white dark:fill-slate-400 dark:stroke-slate-900'
                    }
                    strokeWidth="1.5"
                  />
                  <text
                    x="8"
                    y="3"
                    className={`font-mono text-[10px] font-semibold ${
                      isSelected
                        ? 'fill-sky-700 dark:fill-sky-300'
                        : 'fill-slate-600 dark:fill-slate-400'
                    }`}
                  >
                    {hub.iata}
                  </text>
                </g>
              );
            })}

            {/* Live ADS-B Aircraft Targets */}
            {displayedFlights.map((flight) => {
              const pt = projectLonLat(flight.lon, flight.lat, viewMode, selectedHub);
              if (pt.x < 6 || pt.x > 994 || pt.y < 6 || pt.y > 594) return null;
              const isSelected = selectedFlight?.hex === flight.hex;
              const airline = US_AIRLINES[flight.airlineIcao];
              const planeColor = isSelected
                ? '#F59E0B'
                : airline?.primaryColor || '#0284C7';

              return (
                <g
                  key={flight.hex}
                  transform={`translate(${pt.x}, ${pt.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectFlight(flight);
                  }}
                  className="cursor-pointer"
                >
                  {isSelected && (
                    <circle
                      r="12"
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                    />
                  )}
                  <g transform={`rotate(${flight.headingDeg})`}>
                    <path
                      d="M0 -6.5 L2.2 -1.2 L6.5 1.8 L6.5 3.2 L2.1 1.6 L1.5 5.2 L3.4 6.5 L3.4 7.5 L0 6.5 L-3.4 7.5 L-3.4 6.5 L-1.5 5.2 L-2.1 1.6 L-6.5 3.2 L-6.5 1.8 L-2.2 -1.2 Z"
                      fill={planeColor}
                      stroke="#FFFFFF"
                      strokeWidth="0.65"
                      strokeOpacity="0.85"
                    />
                  </g>
                  {(showCallsigns && (isSelected || viewMode === 'sector' || Boolean(airline))) && (
                    <text
                      x="8"
                      y="-4"
                      className={`font-mono text-[8.5px] font-medium ${
                        isSelected
                          ? 'fill-amber-700 dark:fill-amber-300'
                          : 'fill-slate-700/85 dark:fill-slate-300/85'
                      }`}
                    >
                      {flight.flightNumber}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Bottom-left Coordinate Readout HUD */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-slate-200/90 bg-white/90 px-2.5 py-1 text-[11px] font-mono text-slate-600 backdrop-blur-xs dark:border-slate-700/90 dark:bg-slate-900/90 dark:text-slate-300 tabular-nums">
          <Crosshair className="h-3 w-3 text-sky-600 dark:text-sky-400" />
          {cursorCoords ? (
            <span>
              {cursorCoords.lat.toFixed(2)}°N · {Math.abs(cursorCoords.lon).toFixed(2)}°W
            </span>
          ) : (
            <span>
              {selectedHub.lat.toFixed(2)}°N · {Math.abs(selectedHub.lon).toFixed(2)}°W ({selectedHub.iata})
            </span>
          )}
        </div>

        {/* Selected Aircraft Floating Telemetry Card */}
        {selectedFlight && (
          <div className="absolute right-3 bottom-3 left-3 max-w-sm rounded-lg border border-slate-200 bg-white/95 p-3.5 shadow-sm backdrop-blur-xs sm:left-auto dark:border-slate-700 dark:bg-slate-900/95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AirlineLogo icao={selectedFlight.airlineIcao} size={32} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedFlight.flightNumber}
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {selectedFlight.callsign}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {selectedFlight.airlineName} · {selectedFlight.aircraftType}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectFlight(null)}
                aria-label="Close aircraft inspector"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-200 pt-2.5 text-xs dark:border-slate-800">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Alt</div>
                <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {selectedFlight.altitudeFt.toLocaleString()} ft
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Speed</div>
                <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {selectedFlight.groundSpeedKt} kt
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Hdg</div>
                <div className="flex items-center gap-1 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  <Navigation
                    className="h-3 w-3 text-sky-600 dark:text-sky-400"
                    style={{ transform: `rotate(${selectedFlight.headingDeg}deg)` }}
                  />
                  {selectedFlight.headingDeg}°
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Squawk</div>
                <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {selectedFlight.squawk}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
