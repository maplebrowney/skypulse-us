import { useCallback, useEffect, useMemo, useState } from 'react';
import { Moon, RefreshCw, Sun } from 'lucide-react';
import { US_AIRPORT_HUBS } from './lib/stations.ts';
import { UsAirspaceMap } from './components/UsAirspaceMap.tsx';
import { FlightSchedulesBoard } from './components/FlightSchedulesBoard.tsx';
import { LiveFlightsTable } from './components/LiveFlightsTable.tsx';
import { IosPipelineStudio } from './components/IosPipelineStudio.tsx';
import { AirlineLogo } from './components/AirlineLogo.tsx';
import type { AirspaceSnapshot, LiveFlight, UsAirportHub } from './types/skypulse.ts';

type ActiveTab = 'map' | 'schedules' | 'traffic' | 'ios';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [selectedHub, setSelectedHub] = useState<UsAirportHub>(US_AIRPORT_HUBS[0]);
  const [snapshot, setSnapshot] = useState<AirspaceSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<LiveFlight | null>(null);
  const [scheduleSearch, setScheduleSearch] = useState('');

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('skypulse_theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      window.localStorage.setItem('skypulse_theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('skypulse_theme', 'light');
    }
  }, [darkMode]);

  const fetchAirspace = useCallback(async (hub: UsAirportHub, forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/flights/airspace?iata=${encodeURIComponent(hub.iata)}${forceRefresh ? '&refresh=1' : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Airspace telemetry error (${res.status})`);
      }
      const data = (await res.json()) as AirspaceSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach SkyPulse US airspace feed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAirspace(selectedHub);
  }, [selectedHub, fetchAirspace]);

  const stats = useMemo(() => {
    const live = snapshot?.liveFlights || [];
    const sched = snapshot?.scheduledFlights || [];
    const airborne = live.filter((f) => !f.onGround).length;
    const delayed = sched.filter((s) => s.status === 'Delayed').length;
    const boardingOrActive = sched.filter((s) => s.status === 'Boarding' || s.status === 'In Air').length;
    return {
      airborne,
      conusTotal: snapshot?.conusFlights.length || 0,
      scheduledTotal: sched.length,
      delayed,
      boardingOrActive,
    };
  }, [snapshot]);

  const handleLocateFlight = (flight: LiveFlight) => {
    setSelectedFlight(flight);
    setActiveTab('map');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-[#090E1A] dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-[#0B111E]/95">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          {/* Zone 1: Brand Wordmark only */}
          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white"
          >
            SkyPulse US
          </button>

          {/* Zone 2: 4 Concise Single-Line Navigation Links */}
          <nav className="flex items-center gap-5 overflow-x-auto text-sm font-medium sm:gap-7">
            {(
              [
                { id: 'map', label: 'Airspace Map' },
                { id: 'schedules', label: 'Schedules & Gates' },
                { id: 'traffic', label: 'Live Traffic' },
                { id: 'ios', label: 'iOS & SideStore' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'text-sky-600 dark:text-sky-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute right-0 -bottom-3.5 left-0 h-0.5 bg-sky-600 dark:bg-sky-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('ios')}
              className="whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              Build &amp; Push IPA
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
        {/* Workspace Toolbar: US Hub Selector + METAR Summary + Theme & Refresh */}
        <section className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800/80">
              {US_AIRPORT_HUBS.map((hub) => {
                const active = selectedHub.iata === hub.iata;
                return (
                  <button
                    key={hub.iata}
                    type="button"
                    onClick={() => {
                      setSelectedHub(hub);
                      setSelectedFlight(null);
                    }}
                    className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-sky-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {hub.iata}
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {selectedHub.name}
              </span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>{selectedHub.city}, {selectedHub.state}</span>
              {snapshot?.metar && (
                <>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {snapshot.metar.flightCategory}
                  </span>
                  {snapshot.metar.wspdKt !== null && (
                    <>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        Wind {snapshot.metar.wdir ?? 'VRB'}° @ {snapshot.metar.wspdKt} kt
                      </span>
                    </>
                  )}
                  {snapshot.metar.altimInHg !== null && (
                    <>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {snapshot.metar.altimInHg.toFixed(2)} inHg
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-slate-600" />}
              {darkMode ? 'Light' : 'Dark'}
            </button>

            <button
              type="button"
              onClick={() => fetchAirspace(selectedHub, true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </section>

        {error && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => fetchAirspace(selectedHub, true)}
              className="font-medium underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* View 1: Airspace Map + KPI Strip + Quick Gate & Traffic Overview */}
        {activeTab === 'map' && (
          <div className="space-y-6">
            {/* 4-Column Metric Strip */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0F172A]">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedHub.iata} Sector Airborne
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {loading && !snapshot ? '—' : stats.airborne}
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {snapshot?.feedSource || 'Live ADS-B feed'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0F172A]">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  CONUS Tracked Targets
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {loading && !snapshot ? '—' : stats.conusTotal}
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Continental US airspace
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0F172A]">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Gate Movements
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {loading && !snapshot ? '—' : stats.scheduledTotal}
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {stats.boardingOrActive} active · {stats.delayed} delayed
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0F172A]">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Runway METAR ({selectedHub.icao})
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {snapshot?.metar?.tempC !== null && snapshot?.metar?.tempC !== undefined
                    ? `${Math.round((snapshot.metar.tempC * 9) / 5 + 32)}°F`
                    : '—'}
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title={snapshot?.metar?.rawOb}>
                  {snapshot?.metar?.rawOb || 'Awaiting NOAA METAR'}
                </div>
              </div>
            </div>

            <UsAirspaceMap
              selectedHub={selectedHub}
              onSelectHub={(hub) => {
                setSelectedHub(hub);
                setSelectedFlight(null);
              }}
              liveFlights={snapshot?.liveFlights || []}
              conusFlights={snapshot?.conusFlights || []}
              selectedFlight={selectedFlight}
              onSelectFlight={setSelectedFlight}
            />

            {/* Adjacent Snapshot: Next Gate Departures & Nearby Live Aircraft */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0F172A]">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Upcoming {selectedHub.iata} Gate Board
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('schedules')}
                    className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    Full Schedule
                  </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {(snapshot?.scheduledFlights || []).slice(0, 6).map((sf) => (
                    <div key={sf.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AirlineLogo icao={sf.airlineIcao} size={24} />
                        <div className="min-w-0">
                          <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {sf.flightNumber} · {sf.originIata} → {sf.destinationIata}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {sf.terminal} · Gate {sf.gate}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {sf.estimatedTime}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{sf.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0F172A]">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Active Sector Aircraft
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('traffic')}
                    className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    All Live Flights
                  </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {(snapshot?.liveFlights || []).slice(0, 6).map((lf) => (
                    <button
                      key={lf.hex}
                      type="button"
                      onClick={() => setSelectedFlight(lf)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AirlineLogo icao={lf.airlineIcao} size={24} />
                        <div className="min-w-0">
                          <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {lf.flightNumber} ({lf.callsign})
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {lf.airlineName} · {lf.aircraftType} · {lf.originIata} → {lf.destinationIata}
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono shrink-0 tabular-nums">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {lf.altitudeFt.toLocaleString()} ft
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {lf.groundSpeedKt} kt · {lf.headingDeg}°
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View 2: Scheduled Flights with Gate & Terminal Info */}
        {activeTab === 'schedules' && (
          <FlightSchedulesBoard
            hub={selectedHub}
            schedules={snapshot?.scheduledFlights || []}
            searchQuery={scheduleSearch}
            onSearchChange={setScheduleSearch}
          />
        )}

        {/* View 3: Live Traffic Table */}
        {activeTab === 'traffic' && (
          <LiveFlightsTable
            flights={snapshot?.liveFlights || []}
            selectedFlight={selectedFlight}
            onLocateOnMap={handleLocateFlight}
          />
        )}

        {/* View 4: iOS Wrapper, SideStore/LiveContainer IPA Builder & GitHub Push */}
        {activeTab === 'ios' && <IosPipelineStudio />}
      </main>

      {/* Quiet Footer */}
      <footer className="mx-auto mt-10 max-w-[1400px] border-t border-slate-200 px-4 py-6 text-xs text-slate-500 sm:px-6 dark:border-slate-800 dark:text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span>
            SkyPulse US · Live US ADS-B flight tracking, NOAA METAR weather, terminal/gate schedules, and SideStore/LiveContainer iOS IPA pipeline.
          </span>
          <span className="font-mono tabular-nums">
            Last synced: {snapshot ? new Date(snapshot.fetchedAt).toLocaleTimeString() : '—'}
          </span>
        </div>
      </footer>
    </div>
  );
}
