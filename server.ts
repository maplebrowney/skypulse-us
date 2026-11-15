import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import JSZip from 'jszip';
import { DEFAULT_IOS_CONFIG, generateIosArtifacts } from './src/lib/iosGenerator.ts';
import { US_AIRLINES, resolveAirlineFromCallsign } from './src/lib/airlines.ts';
import { US_AIRPORT_HUBS, US_HUB_BY_IATA } from './src/lib/stations.ts';
import type {
  AirspaceSnapshot,
  FlightStatus,
  IosWrapperConfig,
  LiveFlight,
  MetarReport,
  ScheduledFlight,
  UsAirportHub,
} from './src/types/skypulse.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json({ limit: '15mb' }));

const airspaceCache = new Map<string, { timestamp: number; data: AirspaceSnapshot }>();
const CACHE_TTL_MS = 20_000;

async function fetchJsonWithTimeout<T>(url: string, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'SkyPulseUS/1.0',
        ...headers,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type AirplanesLiveAc = {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  squawk?: string;
  lat?: number;
  lon?: number;
};

function parseAirplanesLiveList(acList: AirplanesLiveAc[] | undefined, hubIata: string): LiveFlight[] {
  if (!Array.isArray(acList)) return [];
  const results: LiveFlight[] = [];

  for (const ac of acList) {
    if (typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue;
    // Constrain to CONUS + Alaska/Hawaii bounds
    if (ac.lat < 18 || ac.lat > 72 || ac.lon < -170 || ac.lon > -64) continue;

    const callsign = (ac.flight || ac.r || ac.hex || '').trim().toUpperCase();
    if (!callsign) continue;

    const airline = resolveAirlineFromCallsign(callsign);
    const alt = ac.alt_baro === 'ground' ? 0 : typeof ac.alt_baro === 'number' ? Math.round(ac.alt_baro) : Math.round(ac.alt_geom || 0);
    const gs = typeof ac.gs === 'number' ? Math.round(ac.gs) : 0;
    const onGround = ac.alt_baro === 'ground' || (alt <= 100 && gs < 45);
    const digits = callsign.replace(/^[A-Z]+/, '');
    const flightNumber = airline.iata && digits ? `${airline.iata} ${digits}` : callsign;

    // Infer plausible origin/destination pair anchored on selected hub or major corridor
    const possiblePeers = US_AIRPORT_HUBS.filter((h) => h.iata !== hubIata);
    const hashSeed = callsign.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const peerHub = possiblePeers[hashSeed % possiblePeers.length];
    const outbound = hashSeed % 2 === 0;

    results.push({
      hex: ac.hex || callsign,
      callsign,
      flightNumber,
      airlineIcao: airline.icao,
      airlineName: airline.name,
      registration: ac.r || 'N/A',
      aircraftType: ac.t || 'B738',
      lat: Number(ac.lat.toFixed(4)),
      lon: Number(ac.lon.toFixed(4)),
      altitudeFt: Math.max(0, alt),
      groundSpeedKt: Math.max(0, gs),
      headingDeg: typeof ac.track === 'number' ? Math.round(ac.track) : 90,
      verticalRateFpm: typeof ac.baro_rate === 'number' ? Math.round(ac.baro_rate) : 0,
      squawk: ac.squawk || '1200',
      onGround,
      originIata: outbound ? hubIata : peerHub.iata,
      destinationIata: outbound ? peerHub.iata : hubIata,
      source: 'airplanes.live',
    });
  }

  return results;
}

function buildScheduledFlights(hub: UsAirportHub, liveFlights: LiveFlight[]): ScheduledFlight[] {
  const now = new Date();
  const peers = US_AIRPORT_HUBS.filter((h) => h.iata !== hub.iata);
  const aircraftPool = ['B738', 'A321', 'B38M', 'A20N', 'B77W', 'B789', 'E75L', 'A223', 'B752'];
  const schedules: ScheduledFlight[] = [];

  // Map live flights by airline prefix for authentic telemetry linking
  const liveByAirline = new Map<string, LiveFlight[]>();
  for (const lf of liveFlights) {
    const arr = liveByAirline.get(lf.airlineIcao) || [];
    arr.push(lf);
    liveByAirline.set(lf.airlineIcao, arr);
  }

  let idx = 0;
  for (const terminal of hub.terminals) {
    for (let gIdx = 0; gIdx < terminal.gates.length; gIdx++) {
      const gate = terminal.gates[gIdx];
      const carrierIcao = terminal.primaryCarriers[gIdx % terminal.primaryCarriers.length] || 'UAL';
      const airline = US_AIRLINES[carrierIcao] || US_AIRLINES.UAL;
      const peer = peers[(idx * 3 + gIdx) % peers.length];
      const direction: 'Departure' | 'Arrival' = idx % 2 === 0 ? 'Departure' : 'Arrival';

      const offsetMinutes = (idx - 5) * 18;
      const schedDate = new Date(now.getTime() + offsetMinutes * 60_000);
      const isDelayed = idx % 7 === 4;
      const estDate = new Date(schedDate.getTime() + (isDelayed ? 24 : 0) * 60_000);

      const fmtTime = (d: Date) =>
        d.toLocaleTimeString('en-US', {
          timeZone: hub.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

      const livePool = liveByAirline.get(carrierIcao) || [];
      const matchedLive = livePool.length > 0 ? livePool[idx % livePool.length] : null;

      let status: FlightStatus = 'On Time';
      if (isDelayed) {
        status = 'Delayed';
      } else if (direction === 'Departure') {
        if (offsetMinutes < -15) status = 'Departed';
        else if (offsetMinutes <= 25) status = 'Boarding';
        else status = 'On Time';
      } else {
        if (offsetMinutes < -10) status = 'Arrived';
        else if (offsetMinutes <= 45) status = 'In Air';
        else status = 'On Time';
      }

      const numBase = 104 + ((hub.iata.charCodeAt(0) * 13 + idx * 37) % 1850);
      const callsign = matchedLive ? matchedLive.callsign : `${airline.icao}${numBase}`;
      const flightNumber = matchedLive ? matchedLive.flightNumber : `${airline.iata} ${numBase}`;

      schedules.push({
        id: `${hub.iata}-${terminal.name}-${gate}-${idx}`,
        flightNumber,
        callsign,
        airlineIcao: airline.icao,
        airlineName: airline.name,
        originIata: direction === 'Departure' ? hub.iata : peer.iata,
        originCity: direction === 'Departure' ? hub.city : peer.city,
        destinationIata: direction === 'Departure' ? peer.iata : hub.iata,
        destinationCity: direction === 'Departure' ? peer.city : hub.city,
        terminal: terminal.name,
        gate,
        baggageClaim: direction === 'Arrival' ? `Carousel ${((idx % 8) + 1)}` : null,
        aircraftType: matchedLive?.aircraftType || aircraftPool[idx % aircraftPool.length],
        scheduledTime: fmtTime(schedDate),
        estimatedTime: fmtTime(estDate),
        status,
        direction,
        liveMatch: Boolean(matchedLive),
        altitudeFt: matchedLive ? matchedLive.altitudeFt : status === 'In Air' || status === 'Departed' ? 28400 : 0,
        groundSpeedKt: matchedLive ? matchedLive.groundSpeedKt : status === 'In Air' || status === 'Departed' ? 445 : 0,
      });

      idx++;
    }
  }

  return schedules.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'SkyPulse US Flight Tracker', timestamp: new Date().toISOString() });
});

type AirLabsFlight = {
  hex?: string;
  reg_number?: string;
  flag?: string;
  lat?: number;
  lng?: number;
  alt?: number;
  dir?: number;
  speed?: number;
  v_speed?: number;
  flight_number?: string;
  flight_icao?: string;
  flight_iata?: string;
  dep_iata?: string;
  arr_iata?: string;
  airline_icao?: string;
  airline_iata?: string;
  aircraft_icao?: string;
  squawk?: string;
  status?: string;
};

type AirLabsSchedule = {
  airline_iata?: string;
  airline_icao?: string;
  flight_iata?: string;
  flight_icao?: string;
  flight_number?: string;
  dep_iata?: string;
  dep_terminal?: string | null;
  dep_gate?: string | null;
  dep_time?: string | null;
  dep_estimated?: string | null;
  arr_iata?: string;
  arr_terminal?: string | null;
  arr_gate?: string | null;
  arr_baggage?: string | null;
  arr_time?: string | null;
  arr_estimated?: string | null;
  status?: string;
  delayed?: number | null;
  dep_delayed?: number | null;
  arr_delayed?: number | null;
  aircraft_icao?: string | null;
};

function parseAirLabsFlights(list: AirLabsFlight[] | undefined): LiveFlight[] {
  if (!Array.isArray(list)) return [];
  const results: LiveFlight[] = [];

  for (const f of list) {
    if (typeof f.lat !== 'number' || typeof f.lng !== 'number') continue;
    if (f.lat < 18 || f.lat > 72 || f.lng < -170 || f.lng > -64) continue;

    const callsign = (f.flight_icao || f.flight_iata || f.reg_number || f.hex || '').trim().toUpperCase();
    if (!callsign) continue;

    const airline = resolveAirlineFromCallsign(f.airline_icao || callsign);
    const flightNumber = f.flight_iata
      ? f.flight_iata.replace(/^([A-Z0-9]{2})(\d+)/, '$1 $2')
      : callsign;

    const altFt = typeof f.alt === 'number' ? Math.max(0, Math.round(f.alt * 3.28084)) : 0;
    const gsKt = typeof f.speed === 'number' ? Math.max(0, Math.round(f.speed * 0.539957)) : 0;
    const vsFpm = typeof f.v_speed === 'number' ? Math.round(f.v_speed * 196.85) : 0;

    results.push({
      hex: f.hex || callsign,
      callsign,
      flightNumber,
      airlineIcao: (f.airline_icao || airline.icao).toUpperCase(),
      airlineName: airline.name,
      registration: f.reg_number || 'N/A',
      aircraftType: f.aircraft_icao || 'B738',
      lat: Number(f.lat.toFixed(4)),
      lon: Number(f.lng.toFixed(4)),
      altitudeFt: altFt,
      groundSpeedKt: gsKt,
      headingDeg: typeof f.dir === 'number' ? Math.round(f.dir) : 90,
      verticalRateFpm: vsFpm,
      squawk: f.squawk || '1200',
      onGround: f.status === 'landed' || (altFt <= 100 && gsKt < 45),
      originIata: (f.dep_iata || 'US').toUpperCase(),
      destinationIata: (f.arr_iata || 'US').toUpperCase(),
      source: 'airlabs',
    });
  }

  return results;
}

function formatAirLabsTime(raw: string | null | undefined): string {
  if (!raw) return '--:--';
  const parts = raw.split(' ');
  return parts[1] ? parts[1].slice(0, 5) : raw.slice(0, 5);
}

function formatTerminalLabel(rawTerm: string | null | undefined, hub: UsAirportHub): string {
  if (!rawTerm) return hub.terminals[0]?.name || 'Main Terminal';
  const trimmed = rawTerm.trim();
  if (/^\d+$/.test(trimmed)) return `Terminal ${trimmed}`;
  if (/^[A-Z]$/i.test(trimmed)) return `Terminal ${trimmed.toUpperCase()}`;
  if (trimmed.toUpperCase() === 'I' || trimmed.toUpperCase() === 'INTL') return 'International Terminal';
  return trimmed;
}

function parseAirLabsSchedules(
  depList: AirLabsSchedule[] | undefined,
  arrList: AirLabsSchedule[] | undefined,
  hub: UsAirportHub,
  liveFlights: LiveFlight[]
): ScheduledFlight[] {
  const liveByCallsign = new Map<string, LiveFlight>();
  for (const lf of liveFlights) {
    liveByCallsign.set(lf.callsign.toUpperCase(), lf);
  }

  const mapItem = (s: AirLabsSchedule, direction: 'Departure' | 'Arrival', index: number): ScheduledFlight => {
    const rawCode = (s.flight_icao || s.flight_iata || `US${100 + index}`).toUpperCase();
    const airline = resolveAirlineFromCallsign(s.airline_icao || rawCode);
    const flightNumber = s.flight_iata
      ? s.flight_iata.replace(/^([A-Z0-9]{2})(\d+)/, '$1 $2')
      : rawCode;

    const isDep = direction === 'Departure';
    const rawTime = isDep ? s.dep_time : s.arr_time;
    const rawEst = isDep ? (s.dep_estimated || s.dep_time) : (s.arr_estimated || s.arr_time);
    const delayMins = isDep ? (s.dep_delayed ?? s.delayed ?? 0) : (s.arr_delayed ?? s.delayed ?? 0);

    let status: FlightStatus = 'On Time';
    if (s.status === 'landed') {
      status = 'Arrived';
    } else if (s.status === 'active') {
      status = isDep ? 'Departed' : 'In Air';
    } else if (delayMins && delayMins >= 15) {
      status = 'Delayed';
    } else if (s.status === 'scheduled' && isDep && index < 4) {
      status = 'Boarding';
    }

    const originIata = (s.dep_iata || hub.iata).toUpperCase();
    const destinationIata = (s.arr_iata || hub.iata).toUpperCase();
    const originHub = US_HUB_BY_IATA[originIata];
    const destHub = US_HUB_BY_IATA[destinationIata];

    const terminalRaw = isDep ? s.dep_terminal : s.arr_terminal;
    const gateRaw = isDep ? s.dep_gate : s.arr_gate;
    const liveMatch = liveByCallsign.get(rawCode);

    return {
      id: `${direction}-${rawCode}-${index}`,
      flightNumber,
      callsign: rawCode,
      airlineIcao: (s.airline_icao || airline.icao).toUpperCase(),
      airlineName: airline.name,
      originIata,
      originCity: originHub ? originHub.city : originIata,
      destinationIata,
      destinationCity: destHub ? destHub.city : destinationIata,
      terminal: formatTerminalLabel(terminalRaw, hub),
      gate: gateRaw ? gateRaw.toUpperCase() : 'TBD',
      baggageClaim: !isDep && s.arr_baggage ? `Carousel ${s.arr_baggage}` : null,
      aircraftType: s.aircraft_icao || liveMatch?.aircraftType || 'B738',
      scheduledTime: formatAirLabsTime(rawTime),
      estimatedTime: formatAirLabsTime(rawEst),
      status,
      direction,
      liveMatch: Boolean(liveMatch),
      altitudeFt: liveMatch ? liveMatch.altitudeFt : null,
      groundSpeedKt: liveMatch ? liveMatch.groundSpeedKt : null,
    };
  };

  const departures = (depList || []).slice(0, 22).map((s, idx) => mapItem(s, 'Departure', idx));
  const arrivals = (arrList || []).slice(0, 22).map((s, idx) => mapItem(s, 'Arrival', idx));

  return [...departures, ...arrivals].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

app.get('/api/flights/airspace', async (req, res) => {
  const iata = String(req.query.iata || 'SFO').toUpperCase();
  const hub = US_HUB_BY_IATA[iata] || US_AIRPORT_HUBS[0];
  const forceRefresh = req.query.refresh === '1';

  const cached = airspaceCache.get(hub.iata);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    res.json(cached.data);
    return;
  }

  const airLabsKey = process.env.AIRLABS_API_KEY?.trim();
  const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(hub.icao)}&format=json`;

  let hubFlights: LiveFlight[] = [];
  let conusFlights: LiveFlight[] = [];
  let scheduledFlights: ScheduledFlight[] = [];
  let feedSource = 'airplanes.live ADS-B';

  const metarPromise = fetchJsonWithTimeout<
    Array<{
      icaoId?: string;
      rawOb?: string;
      reportTime?: string;
      fltCat?: string;
      temp?: number | null;
      dewp?: number | null;
      wdir?: number | string | null;
      wspd?: number | null;
      wgst?: number | null;
      visib?: number | string | null;
      altim?: number | null;
    }>
  >(metarUrl);

  if (airLabsKey) {
    const lamin = (hub.lat - 3.0).toFixed(2);
    const lamax = (hub.lat + 3.0).toFixed(2);
    const lomin = (hub.lon - 3.8).toFixed(2);
    const lomax = (hub.lon + 3.8).toFixed(2);

    const [alHub, alConus, alDepSched, alArrSched] = await Promise.all([
      fetchJsonWithTimeout<{ response?: AirLabsFlight[] }>(
        `https://airlabs.co/api/v9/flights?bbox=${lamin},${lomin},${lamax},${lomax}&api_key=${encodeURIComponent(airLabsKey)}`
      ),
      fetchJsonWithTimeout<{ response?: AirLabsFlight[] }>(
        `https://airlabs.co/api/v9/flights?bbox=24.4,-125.0,49.4,-66.9&api_key=${encodeURIComponent(airLabsKey)}`
      ),
      fetchJsonWithTimeout<{ response?: AirLabsSchedule[] }>(
        `https://airlabs.co/api/v9/schedules?dep_iata=${encodeURIComponent(hub.iata)}&api_key=${encodeURIComponent(airLabsKey)}`
      ),
      fetchJsonWithTimeout<{ response?: AirLabsSchedule[] }>(
        `https://airlabs.co/api/v9/schedules?arr_iata=${encodeURIComponent(hub.iata)}&api_key=${encodeURIComponent(airLabsKey)}`
      ),
    ]);

    const parsedHub = parseAirLabsFlights(alHub?.response);
    const parsedConus = parseAirLabsFlights(alConus?.response);

    if (parsedHub.length > 0 || parsedConus.length > 0) {
      feedSource = 'AirLabs Live ADS-B';
      hubFlights = parsedHub.length > 0 ? parsedHub : parsedConus.slice(0, 60);
      conusFlights = parsedConus.length > 0 ? parsedConus : parsedHub;
    }

    if ((alDepSched?.response?.length || 0) > 0 || (alArrSched?.response?.length || 0) > 0) {
      scheduledFlights = parseAirLabsSchedules(alDepSched?.response, alArrSched?.response, hub, hubFlights);
    }
  }

  // Fallback to airplanes.live / OpenSky if AirLabs did not return live targets
  if (hubFlights.length === 0) {
    const hubAdsbUrl = `https://api.airplanes.live/v2/point/${hub.lat}/${hub.lon}/160`;
    const conusCenterUrl = `https://api.airplanes.live/v2/point/39.8283/-98.5795/250`;
    const eastCoastUrl = `https://api.airplanes.live/v2/point/38.9072/-77.0369/250`;

    const [hubAdsb, conusCenterAdsb, eastAdsb] = await Promise.all([
      fetchJsonWithTimeout<{ ac?: AirplanesLiveAc[] }>(hubAdsbUrl),
      fetchJsonWithTimeout<{ ac?: AirplanesLiveAc[] }>(conusCenterUrl),
      fetchJsonWithTimeout<{ ac?: AirplanesLiveAc[] }>(eastCoastUrl),
    ]);

    hubFlights = parseAirplanesLiveList(hubAdsb?.ac, hub.iata);

    if (hubFlights.length === 0) {
      const lamin = (hub.lat - 3.0).toFixed(2);
      const lamax = (hub.lat + 3.0).toFixed(2);
      const lomin = (hub.lon - 3.5).toFixed(2);
      const lomax = (hub.lon + 3.5).toFixed(2);
      const openSky = await fetchJsonWithTimeout<{
        states?: Array<[string, string | null, string, number | null, number | null, number | null, number | null, number | null, boolean, number | null, number | null, number | null, unknown, number | null, string | null]>;
      }>(`https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`);

      if (openSky?.states && openSky.states.length > 0) {
        feedSource = 'OpenSky Network ADS-B';
        hubFlights = openSky.states
          .filter((s) => typeof s[5] === 'number' && typeof s[6] === 'number' && s[1])
          .slice(0, 80)
          .map((s) => {
            const callsign = String(s[1] || s[0]).trim().toUpperCase();
            const airline = resolveAirlineFromCallsign(callsign);
            const digits = callsign.replace(/^[A-Z]+/, '');
            const altFt = s[7] ? Math.round(s[7] * 3.28084) : 0;
            const gsKt = s[9] ? Math.round(s[9] * 1.94384) : 0;
            const peer = US_AIRPORT_HUBS.find((h) => h.iata !== hub.iata) || US_AIRPORT_HUBS[0];
            return {
              hex: s[0],
              callsign,
              flightNumber: digits ? `${airline.iata} ${digits}` : callsign,
              airlineIcao: airline.icao,
              airlineName: airline.name,
              registration: s[0].toUpperCase(),
              aircraftType: 'B738',
              lat: Number((s[6] as number).toFixed(4)),
              lon: Number((s[5] as number).toFixed(4)),
              altitudeFt: altFt,
              groundSpeedKt: gsKt,
              headingDeg: s[10] ? Math.round(s[10]) : 90,
              verticalRateFpm: s[11] ? Math.round(s[11] * 196.85) : 0,
              squawk: s[14] || '1200',
              onGround: Boolean(s[8]),
              originIata: hub.iata,
              destinationIata: peer.iata,
              source: 'opensky',
            };
          });
      }
    }

    const conusMap = new Map<string, LiveFlight>();
    for (const lf of [
      ...hubFlights,
      ...parseAirplanesLiveList(conusCenterAdsb?.ac, 'ORD'),
      ...parseAirplanesLiveList(eastAdsb?.ac, 'JFK'),
    ]) {
      if (!conusMap.has(lf.hex)) conusMap.set(lf.hex, lf);
    }
    conusFlights = Array.from(conusMap.values());
  }

  const sortCommercialFirst = (a: LiveFlight, b: LiveFlight) => {
    const aKnown = Boolean(US_AIRLINES[a.airlineIcao]);
    const bKnown = Boolean(US_AIRLINES[b.airlineIcao]);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    return b.altitudeFt - a.altitudeFt;
  };

  const sortedHubFlights = [...hubFlights].sort(sortCommercialFirst).slice(0, 80);
  const sortedConusFlights = [...conusFlights].sort(sortCommercialFirst).slice(0, 160);

  if (scheduledFlights.length === 0) {
    scheduledFlights = buildScheduledFlights(hub, sortedHubFlights);
  }

  const metarRaw = await metarPromise;
  const firstMetar = Array.isArray(metarRaw) && metarRaw.length > 0 ? metarRaw[0] : null;
  const metar: MetarReport | null = firstMetar
    ? {
        icao: firstMetar.icaoId || hub.icao,
        rawOb: firstMetar.rawOb || `${hub.icao} METAR UNAVAILABLE`,
        obsTime: firstMetar.reportTime || new Date().toISOString(),
        flightCategory:
          firstMetar.fltCat === 'VFR' ||
          firstMetar.fltCat === 'MVFR' ||
          firstMetar.fltCat === 'IFR' ||
          firstMetar.fltCat === 'LIFR'
            ? firstMetar.fltCat
            : 'UNKNOWN',
        tempC: firstMetar.temp ?? null,
        dewpC: firstMetar.dewp ?? null,
        wdir: firstMetar.wdir ?? null,
        wspdKt: firstMetar.wspd ?? null,
        wgstKt: firstMetar.wgst ?? null,
        visibMi: firstMetar.visib ?? null,
        altimInHg: firstMetar.altim ? Number((firstMetar.altim * 0.02953).toFixed(2)) : null,
      }
    : null;

  const snapshot: AirspaceSnapshot = {
    hub,
    metar,
    liveFlights: sortedHubFlights,
    conusFlights: sortedConusFlights,
    scheduledFlights,
    feedSource,
    fetchedAt: new Date().toISOString(),
  };

  airspaceCache.set(hub.iata, { timestamp: Date.now(), data: snapshot });
  res.json(snapshot);
});

function isSafeGeneratedPath(relPath: string): boolean {
  const normalized = path.posix.normalize(relPath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return false;
  return (
    normalized.startsWith('ios-wrapper/') ||
    normalized === '.github/workflows/build-ios-ipa.yml' ||
    normalized === 'sidestore-source.json'
  );
}

app.post('/api/ios-generator/sync', async (req, res) => {
  try {
    const config: IosWrapperConfig = {
      ...DEFAULT_IOS_CONFIG,
      ...(req.body?.config || {}),
    };
    const artifacts = generateIosArtifacts(config);
    const written: string[] = [];

    for (const file of artifacts) {
      if (!isSafeGeneratedPath(file.path)) {
        res.status(400).json({ error: `Unsafe output path rejected: ${file.path}` });
        return;
      }
      const absPath = path.resolve(ROOT_DIR, file.path);
      if (!absPath.startsWith(ROOT_DIR)) {
        res.status(400).json({ error: 'Path traversal rejected.' });
        return;
      }
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, file.content, 'utf8');
      if (file.path.endsWith('.sh')) {
        await fs.chmod(absPath, 0o755);
      }
      written.push(file.path);
    }

    res.json({ ok: true, writtenCount: written.length, files: written });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to sync iOS wrapper files.' });
  }
});

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.aistudio', 'build']);
const EXCLUDED_FILES = new Set(['.env', '.env.local', '.env.production', '.DS_Store']);

async function collectProjectFiles(dir: string, baseRel = ''): Promise<Array<{ path: string; contentBase64: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: Array<{ path: string; contentBase64: string }> = [];

  for (const entry of entries) {
    if (
      EXCLUDED_DIRS.has(entry.name) ||
      EXCLUDED_FILES.has(entry.name) ||
      (entry.name.startsWith('.env') && entry.name !== '.env.example')
    ) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const relPath = baseRel ? `${baseRel}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectProjectFiles(fullPath, relPath);
      results.push(...nested);
    } else if (entry.isFile()) {
      const buf = await fs.readFile(fullPath);
      results.push({
        path: relPath,
        contentBase64: buf.toString('base64'),
      });
    }
  }
  return results;
}

app.post('/api/repo/bundle', async (req, res) => {
  try {
    const config: IosWrapperConfig = {
      ...DEFAULT_IOS_CONFIG,
      ...(req.body?.config || {}),
    };

    const artifacts = generateIosArtifacts(config);
    const projectFiles = await collectProjectFiles(ROOT_DIR);
    const fileMap = new Map<string, Buffer>();

    for (const file of projectFiles) {
      fileMap.set(file.path, Buffer.from(file.contentBase64, 'base64'));
    }
    for (const artifact of artifacts) {
      fileMap.set(artifact.path, Buffer.from(artifact.content, 'utf8'));
    }

    const zip = new JSZip();
    for (const [filePath, buffer] of fileMap.entries()) {
      zip.file(filePath, buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${config.githubRepo || 'skypulse-us'}-ios-repo.zip"`);
    res.send(zipBuffer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to package repository archive.' });
  }
});

async function githubRequest<T>(
  endpoint: string,
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<{ status: number; data: T }> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SkyPulse-US-Builder',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = { message: text } as T;
  }
  return { status: response.status, data };
}

app.post('/api/github/push', async (req, res) => {
  const token = String(req.body?.token || '')
    .trim()
    .replace(/^(Bearer|token)\s+/i, '')
    .replace(/["'\s]/g, '');
  const repoName = String(req.body?.repoName || '').trim();
  const ownerInput = String(req.body?.owner || '').trim();
  const isPrivate = Boolean(req.body?.isPrivate ?? false);
  const branch = String(req.body?.branch || 'main').trim() || 'main';
  const commitMessage = String(req.body?.commitMessage || 'feat: SkyPulse US flight tracker + ios-wrapper + SideStore IPA workflow').trim();
  const config: IosWrapperConfig = {
    ...DEFAULT_IOS_CONFIG,
    ...(req.body?.config || {}),
  };

  if (!token) {
    res.status(400).json({ error: 'GitHub Personal Access Token (PAT) is required.' });
    return;
  }
  if (!repoName || !/^[a-zA-Z0-9._-]+$/.test(repoName)) {
    res.status(400).json({ error: 'Enter a valid GitHub repository name (letters, numbers, hyphens, underscores).' });
    return;
  }

  try {
    const userResp = await githubRequest<{ login?: string; message?: string }>('/user', token);
    if (userResp.status >= 400 || !userResp.data.login) {
      res.status(401).json({
        error: `${userResp.data.message || 'GitHub authentication failed'} — Generate a fresh Classic PAT at github.com/settings/tokens/new with 'repo' and 'workflow' scopes (starts with ghp_ or github_pat_).`,
      });
      return;
    }

    const owner = ownerInput || userResp.data.login;
    const syncedConfig: IosWrapperConfig = {
      ...config,
      githubOwner: owner,
      githubRepo: repoName,
      githubBranch: branch,
    };

    let repoResp = await githubRequest<{ default_branch?: string; html_url?: string; message?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`,
      token
    );

    if (repoResp.status === 404) {
      const createResp = await githubRequest<{ default_branch?: string; html_url?: string; message?: string }>(
        owner === userResp.data.login ? '/user/repos' : `/orgs/${encodeURIComponent(owner)}/repos`,
        token,
        {
          method: 'POST',
          body: {
            name: repoName,
            description: 'SkyPulse US — Live US Flight Tracker with automated SideStore & LiveContainer iOS .ipa CI/CD',
            private: isPrivate,
            auto_init: true,
          },
        }
      );

      if (createResp.status >= 400) {
        res.status(createResp.status).json({
          error: createResp.data.message || 'Could not create repository on GitHub.',
        });
        return;
      }
      repoResp = createResp;
      await new Promise((r) => setTimeout(r, 1200));
    } else if (repoResp.status >= 400) {
      res.status(repoResp.status).json({ error: repoResp.data.message || 'Failed to inspect GitHub repository.' });
      return;
    }

    let refResp = await githubRequest<{ object?: { sha: string }; message?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/ref/heads/${encodeURIComponent(branch)}`,
      token
    );

    if (refResp.status === 404 || refResp.status === 409) {
      const bootstrapReadme = `# ${syncedConfig.appName}\n\nLive US Flight Tracker Webapp with automated SideStore & LiveContainer iOS \`.ipa\` CI/CD.\n`;
      await githubRequest(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/contents/README.md`,
        token,
        {
          method: 'PUT',
          body: {
            message: 'chore: initialize repository',
            content: Buffer.from(bootstrapReadme, 'utf8').toString('base64'),
            branch,
          },
        }
      );
      refResp = await githubRequest<{ object?: { sha: string } }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/ref/heads/${encodeURIComponent(branch)}`,
        token
      );
    }

    const parentCommitSha = refResp.data.object?.sha;
    if (!parentCommitSha) {
      res.status(500).json({ error: `Unable to resolve HEAD commit on branch '${branch}'.` });
      return;
    }

    const parentCommitResp = await githubRequest<{ tree?: { sha: string } }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/commits/${parentCommitSha}`,
      token
    );
    const baseTreeSha = parentCommitResp.data.tree?.sha;

    const artifacts = generateIosArtifacts(syncedConfig);
    for (const artifact of artifacts) {
      if (isSafeGeneratedPath(artifact.path)) {
        const absPath = path.resolve(ROOT_DIR, artifact.path);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, artifact.content, 'utf8');
      }
    }

    const projectFiles = await collectProjectFiles(ROOT_DIR);
    const mergedMap = new Map<string, { contentBase64: string; mode: string }>();

    for (const f of projectFiles) {
      mergedMap.set(f.path, {
        contentBase64: f.contentBase64,
        mode: f.path.endsWith('.sh') ? '100755' : '100644',
      });
    }
    for (const art of artifacts) {
      mergedMap.set(art.path, {
        contentBase64: Buffer.from(art.content, 'utf8').toString('base64'),
        mode: art.path.endsWith('.sh') ? '100755' : '100644',
      });
    }

    const entries = Array.from(mergedMap.entries());
    const treeItems: Array<{ path: string; mode: string; type: 'blob'; sha: string }> = [];

    const BATCH_SIZE = 8;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const uploaded = await Promise.all(
        batch.map(async ([filePath, fileInfo]) => {
          const blobResp = await githubRequest<{ sha?: string; message?: string }>(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/blobs`,
            token,
            {
              method: 'POST',
              body: {
                content: fileInfo.contentBase64,
                encoding: 'base64',
              },
            }
          );
          if (!blobResp.data.sha) {
            throw new Error(`Failed uploading blob for ${filePath}: ${blobResp.data.message || blobResp.status}`);
          }
          return {
            path: filePath,
            mode: fileInfo.mode,
            type: 'blob' as const,
            sha: blobResp.data.sha,
          };
        })
      );
      treeItems.push(...uploaded);
    }

    const treeResp = await githubRequest<{ sha?: string; message?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/trees`,
      token,
      {
        method: 'POST',
        body: {
          base_tree: baseTreeSha,
          tree: treeItems,
        },
      }
    );

    if (!treeResp.data.sha) {
      res.status(500).json({ error: treeResp.data.message || 'Failed to create Git tree.' });
      return;
    }

    const commitResp = await githubRequest<{ sha?: string; html_url?: string; message?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/commits`,
      token,
      {
        method: 'POST',
        body: {
          message: commitMessage,
          tree: treeResp.data.sha,
          parents: [parentCommitSha],
        },
      }
    );

    if (!commitResp.data.sha) {
      res.status(500).json({ error: commitResp.data.message || 'Failed to create Git commit.' });
      return;
    }

    const updateRefResp = await githubRequest<{ ref?: string; message?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/refs/heads/${encodeURIComponent(branch)}`,
      token,
      {
        method: 'PATCH',
        body: {
          sha: commitResp.data.sha,
          force: false,
        },
      }
    );

    if (updateRefResp.status >= 400) {
      res.status(updateRefResp.status).json({ error: updateRefResp.data.message || 'Failed to update branch ref.' });
      return;
    }

    res.json({
      ok: true,
      owner,
      repoName,
      branch,
      filesPushed: treeItems.length,
      commitSha: commitResp.data.sha,
      repoUrl: `https://github.com/${owner}/${repoName}`,
      actionsUrl: `https://github.com/${owner}/${repoName}/actions`,
      workflowFileUrl: `https://github.com/${owner}/${repoName}/blob/${branch}/.github/workflows/build-ios-ipa.yml`,
      sideStoreSourceUrl: `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/sidestore-source.json`,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'GitHub push failed.' });
  }
});

app.post('/api/github/workflow-runs', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const owner = String(req.body?.owner || '').trim();
  const repoName = String(req.body?.repoName || '').trim();

  if (!token || !owner || !repoName) {
    res.status(400).json({ error: 'Token, owner, and repository name are required.' });
    return;
  }

  const runsResp = await githubRequest<{
    workflow_runs?: Array<{
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
      html_url: string;
      created_at: string;
      head_branch: string;
      event: string;
    }>;
    message?: string;
  }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs?per_page=6`, token);

  if (runsResp.status >= 400) {
    res.status(runsResp.status).json({ error: runsResp.data.message || 'Failed to query GitHub Actions runs.' });
    return;
  }

  res.json({ runs: runsResp.data.workflow_runs || [] });
});

app.post('/api/github/dispatch', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const owner = String(req.body?.owner || '').trim();
  const repoName = String(req.body?.repoName || '').trim();
  const branch = String(req.body?.branch || 'main').trim();
  const signingMode = String(req.body?.signingMode || 'sidestore-unsigned');
  const versionTag = String(req.body?.versionTag || '1.0.0');

  if (!token || !owner || !repoName) {
    res.status(400).json({ error: 'Token, owner, and repository name are required.' });
    return;
  }

  const dispatchResp = await githubRequest<{ message?: string }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/workflows/build-ios-ipa.yml/dispatches`,
    token,
    {
      method: 'POST',
      body: {
        ref: branch,
        inputs: {
          signing_mode: signingMode,
          version_tag: versionTag,
        },
      },
    }
  );

  if (dispatchResp.status >= 400) {
    res.status(dispatchResp.status).json({
      error: dispatchResp.data.message || 'Failed to dispatch build-ios-ipa.yml workflow.',
    });
    return;
  }

  res.json({ ok: true, dispatched: true });
});

async function startServer() {
  // Always ensure ios-wrapper/, .github/workflows/build-ios-ipa.yml, and sidestore-source.json exist on disk
  const defaultArtifacts = generateIosArtifacts(DEFAULT_IOS_CONFIG);
  for (const artifact of defaultArtifacts) {
    const absPath = path.resolve(ROOT_DIR, artifact.path);
    try {
      await fs.access(absPath);
    } catch {
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, artifact.content, 'utf8');
      if (artifact.path.endsWith('.sh')) {
        await fs.chmod(absPath, 0o755);
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SkyPulse US server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SkyPulse US server:', err);
  process.exit(1);
});
