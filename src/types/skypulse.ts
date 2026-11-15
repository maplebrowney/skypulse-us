export type UsAirportHub = {
  iata: string;
  icao: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  elevationFt: number;
  timezone: string;
  terminals: Array<{
    name: string;
    concourses: string[];
    gates: string[];
    primaryCarriers: string[];
  }>;
};

export type AirlineInfo = {
  icao: string;
  iata: string;
  name: string;
  shortName: string;
  callsign: string;
  primaryColor: string;
  secondaryColor: string;
  hubs: string[];
};

export type LiveFlight = {
  hex: string;
  callsign: string;
  flightNumber: string;
  airlineIcao: string;
  airlineName: string;
  registration: string;
  aircraftType: string;
  lat: number;
  lon: number;
  altitudeFt: number;
  groundSpeedKt: number;
  headingDeg: number;
  verticalRateFpm: number;
  squawk: string;
  onGround: boolean;
  originIata: string;
  destinationIata: string;
  source: 'airlabs' | 'airplanes.live' | 'opensky' | 'faa-telemetry';
};

export type FlightStatus =
  | 'On Time'
  | 'Boarding'
  | 'Departed'
  | 'In Air'
  | 'Delayed'
  | 'Arrived';

export type ScheduledFlight = {
  id: string;
  flightNumber: string;
  callsign: string;
  airlineIcao: string;
  airlineName: string;
  originIata: string;
  originCity: string;
  destinationIata: string;
  destinationCity: string;
  terminal: string;
  gate: string;
  baggageClaim: string | null;
  aircraftType: string;
  scheduledTime: string;
  estimatedTime: string;
  status: FlightStatus;
  direction: 'Departure' | 'Arrival';
  liveMatch: boolean;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
};

export type MetarReport = {
  icao: string;
  rawOb: string;
  obsTime: string;
  flightCategory: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNKNOWN';
  tempC: number | null;
  dewpC: number | null;
  wdir: number | string | null;
  wspdKt: number | null;
  wgstKt: number | null;
  visibMi: number | string | null;
  altimInHg: number | null;
};

export type AirspaceSnapshot = {
  hub: UsAirportHub;
  metar: MetarReport | null;
  liveFlights: LiveFlight[];
  conusFlights: LiveFlight[];
  scheduledFlights: ScheduledFlight[];
  feedSource: string;
  fetchedAt: string;
};

export type SigningMode = 'sidestore-unsigned' | 'apple-cert-p12';
export type WebBundleMode = 'hybrid-offline' | 'remote-url';

export type IosWrapperConfig = {
  appName: string;
  productName: string;
  bundleId: string;
  version: string;
  buildNumber: string;
  urlScheme: string;
  minIosVersion: string;
  signingMode: SigningMode;
  webBundleMode: WebBundleMode;
  remoteAppUrl: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  teamId: string;
  enableLocation: boolean;
  enableBackgroundRefresh: boolean;
  enableSideStoreSource: boolean;
  liveContainerCompatible: boolean;
  tintColor: string;
};

export type GeneratedFileEntry = {
  path: string;
  language: 'yaml' | 'swift' | 'xml' | 'json' | 'bash' | 'markdown';
  category: 'ios-wrapper' | 'workflow' | 'sidestore';
  description: string;
  content: string;
};
