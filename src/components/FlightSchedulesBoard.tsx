import { useMemo, useState, type FC } from 'react';
import { ArrowRight, Clock, DoorOpen, Search } from 'lucide-react';
import { AirlineLogo } from './AirlineLogo.tsx';
import type { FlightStatus, ScheduledFlight, UsAirportHub } from '../types/skypulse.ts';

type FlightSchedulesBoardProps = {
  hub: UsAirportHub;
  schedules: ScheduledFlight[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

function statusLabel(status: FlightStatus): { symbol: string; toneClass: string } {
  switch (status) {
    case 'On Time':
      return { symbol: '●', toneClass: 'text-emerald-700 dark:text-emerald-400' };
    case 'Boarding':
      return { symbol: '▲', toneClass: 'text-sky-700 dark:text-sky-400' };
    case 'In Air':
      return { symbol: '→', toneClass: 'text-sky-700 dark:text-sky-400' };
    case 'Delayed':
      return { symbol: '◆', toneClass: 'text-amber-700 dark:text-amber-400' };
    case 'Departed':
    case 'Arrived':
      return { symbol: '✓', toneClass: 'text-slate-600 dark:text-slate-400' };
  }
}

export const FlightSchedulesBoard: FC<FlightSchedulesBoardProps> = ({
  hub,
  schedules,
  searchQuery,
  onSearchChange,
}) => {
  const [directionFilter, setDirectionFilter] = useState<'All' | 'Departure' | 'Arrival'>('All');
  const [terminalFilter, setTerminalFilter] = useState<string>('All');
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduledFlight | null>(null);

  const terminalNames = useMemo(() => hub.terminals.map((t) => t.name), [hub]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return schedules.filter((f) => {
      if (directionFilter !== 'All' && f.direction !== directionFilter) return false;
      if (terminalFilter !== 'All' && f.terminal !== terminalFilter) return false;
      if (!q) return true;
      return (
        f.flightNumber.toLowerCase().includes(q) ||
        f.callsign.toLowerCase().includes(q) ||
        f.airlineName.toLowerCase().includes(q) ||
        f.gate.toLowerCase().includes(q) ||
        f.terminal.toLowerCase().includes(q) ||
        f.originIata.toLowerCase().includes(q) ||
        f.destinationIata.toLowerCase().includes(q) ||
        f.destinationCity.toLowerCase().includes(q) ||
        f.originCity.toLowerCase().includes(q)
      );
    });
  }, [schedules, directionFilter, terminalFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Terminal Directory Summary Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {hub.terminals.map((term) => {
          const termFlights = schedules.filter((s) => s.terminal === term.name);
          const activeTerm = terminalFilter === term.name;
          return (
            <button
              key={term.name}
              type="button"
              onClick={() => setTerminalFilter(activeTerm ? 'All' : term.name)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                activeTerm
                  ? 'border-sky-500 bg-sky-50/70 dark:border-sky-400 dark:bg-sky-950/30'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-[#0F172A] dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {term.name}
                </span>
                <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                  {termFlights.length} flights
                </span>
              </div>
              <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                Gates {term.gates[0]}–{term.gates[term.gates.length - 1]} · {term.primaryCarriers.join(' / ')}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Schedule Table Card */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {hub.iata} Terminal &amp; Gate Schedule
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {filtered.length} of {schedules.length} movements · {hub.timezone.replace('America/', '').replace('_', ' ')} Time
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Filter flight, gate, city..."
                className="h-8 w-48 rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              {(['All', 'Departure', 'Arrival'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setDirectionFilter(dir)}
                  className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    directionFilter === dir
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {dir === 'All' ? 'All' : dir === 'Departure' ? 'Departures' : 'Arrivals'}
                </button>
              ))}
            </div>

            <select
              value={terminalFilter}
              onChange={(e) => setTerminalFilter(e.target.value)}
              aria-label="Filter by terminal"
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="All">All Terminals</option>
              {terminalNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <th className="py-2.5 pr-3 pl-5">Flight</th>
                <th className="px-3 py-2.5">Route</th>
                <th className="px-3 py-2.5">Terminal</th>
                <th className="px-3 py-2.5">Gate</th>
                <th className="px-3 py-2.5 text-right">Sched</th>
                <th className="px-3 py-2.5 text-right">Est</th>
                <th className="px-3 py-2.5">Aircraft</th>
                <th className="py-2.5 pr-5 pl-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No flights match your terminal or search filter.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setDirectionFilter('All');
                        setTerminalFilter('All');
                        onSearchChange('');
                      }}
                      className="font-medium text-sky-600 hover:underline dark:text-sky-400"
                    >
                      Reset filters
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map((flight) => {
                  const st = statusLabel(flight.status);
                  const isSelected = selectedSchedule?.id === flight.id;
                  return (
                    <tr
                      key={flight.id}
                      onClick={() => setSelectedSchedule(isSelected ? null : flight)}
                      className={`h-11 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-50/80 dark:bg-sky-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2 pr-3 pl-5">
                        <div className="flex items-center gap-2.5">
                          <AirlineLogo icao={flight.airlineIcao} size={26} />
                          <div>
                            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                              {flight.flightNumber}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {flight.airlineName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                          <span>{flight.originIata}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span>{flight.destinationIata}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {flight.direction === 'Departure' ? flight.destinationCity : `From ${flight.originCity}`}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">
                        {flight.terminal}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono font-semibold text-sky-700 dark:text-sky-300 tabular-nums">
                          {flight.gate}
                        </span>
                        {flight.baggageClaim && (
                          <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            · {flight.baggageClaim}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                        {flight.scheduledTime}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                        {flight.estimatedTime}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                        {flight.aircraftType}
                      </td>
                      <td className="py-2 pr-5 pl-3">
                        <span className={`font-medium whitespace-nowrap ${st.toneClass}`}>
                          {st.symbol} {flight.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Gate & Flight Detail Strip */}
        {selectedSchedule && (
          <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AirlineLogo icao={selectedSchedule.airlineIcao} size={36} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedSchedule.airlineName} {selectedSchedule.flightNumber}
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      Callsign {selectedSchedule.callsign}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {selectedSchedule.originCity} ({selectedSchedule.originIata}) to {selectedSchedule.destinationCity} ({selectedSchedule.destinationIata}) · Equipment {selectedSchedule.aircraftType}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Terminal / Gate</div>
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {selectedSchedule.terminal} · Gate {selectedSchedule.gate}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Schedule / Est</div>
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {selectedSchedule.scheduledTime} / {selectedSchedule.estimatedTime}
                    </div>
                  </div>
                </div>
                {selectedSchedule.liveMatch && selectedSchedule.altitudeFt !== null && (
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">ADS-B Telemetry</div>
                    <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {selectedSchedule.altitudeFt.toLocaleString()} ft · {selectedSchedule.groundSpeedKt} kt
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
