import { useMemo, useState, type FC } from 'react';
import { MapPin, Navigation, Search } from 'lucide-react';
import { AirlineLogo } from './AirlineLogo.tsx';
import type { LiveFlight } from '../types/skypulse.ts';

type LiveFlightsTableProps = {
  flights: LiveFlight[];
  selectedFlight: LiveFlight | null;
  onLocateOnMap: (flight: LiveFlight) => void;
};

export const LiveFlightsTable: FC<LiveFlightsTableProps> = ({
  flights,
  selectedFlight,
  onLocateOnMap,
}) => {
  const [query, setQuery] = useState('');
  const [airborneOnly, setAirborneOnly] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flights.filter((f) => {
      if (airborneOnly && f.onGround) return false;
      if (!q) return true;
      return (
        f.callsign.toLowerCase().includes(q) ||
        f.flightNumber.toLowerCase().includes(q) ||
        f.airlineName.toLowerCase().includes(q) ||
        f.aircraftType.toLowerCase().includes(q) ||
        f.registration.toLowerCase().includes(q)
      );
    });
  }, [flights, query, airborneOnly]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0F172A]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Live ADS-B Transponder Feed
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {filtered.length} aircraft tracked
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Callsign, tail, type..."
              className="h-8 w-44 rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={() => setAirborneOnly((v) => !v)}
            className={`whitespace-nowrap shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              airborneOnly
                ? 'border-sky-500/40 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-950/40 dark:text-sky-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400'
            }`}
          >
            {airborneOnly ? 'Airborne Only' : 'Airborne + Ground'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <th className="py-2.5 pr-3 pl-5">Carrier / Flight</th>
              <th className="px-3 py-2.5">Callsign · Tail</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 text-right">Altitude</th>
              <th className="px-3 py-2.5 text-right">Speed</th>
              <th className="px-3 py-2.5 text-right">Heading</th>
              <th className="px-3 py-2.5 text-right">V/S</th>
              <th className="px-3 py-2.5 text-right">Squawk</th>
              <th className="py-2.5 pr-5 pl-3 text-right">Map</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  No live aircraft matched this filter.
                </td>
              </tr>
            ) : (
              filtered.map((flight) => {
                const isSelected = selectedFlight?.hex === flight.hex;
                return (
                  <tr
                    key={flight.hex}
                    onClick={() => onLocateOnMap(flight)}
                    className={`h-10 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-sky-50/80 dark:bg-sky-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2 pr-3 pl-5">
                      <div className="flex items-center gap-2.5">
                        <AirlineLogo icao={flight.airlineIcao} size={24} />
                        <div>
                          <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {flight.flightNumber}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {flight.airlineName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                      {flight.callsign} · {flight.registration}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                      {flight.aircraftType}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                      {flight.onGround ? 'GND' : `${flight.altitudeFt.toLocaleString()} ft`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                      {flight.groundSpeedKt} kt
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      <span className="inline-flex items-center justify-end gap-1">
                        <Navigation
                          className="h-3 w-3 text-sky-600 dark:text-sky-400"
                          style={{ transform: `rotate(${flight.headingDeg}deg)` }}
                        />
                        {flight.headingDeg}°
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      <span
                        className={
                          flight.verticalRateFpm > 200
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : flight.verticalRateFpm < -200
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {flight.verticalRateFpm > 0 ? `+${flight.verticalRateFpm}` : flight.verticalRateFpm} fpm
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                      {flight.squawk}
                    </td>
                    <td className="py-2 pr-5 pl-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLocateOnMap(flight);
                        }}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <MapPin className="h-3 w-3" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
