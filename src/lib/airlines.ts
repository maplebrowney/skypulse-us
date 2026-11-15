import type { AirlineInfo } from '../types/skypulse.ts';

export const US_AIRLINES: Record<string, AirlineInfo> = {
  UAL: {
    icao: 'UAL',
    iata: 'UA',
    name: 'United Airlines',
    shortName: 'United',
    callsign: 'UNITED',
    primaryColor: '#005DAA',
    secondaryColor: '#38BDF8',
    hubs: ['ORD', 'SFO', 'EWR', 'DEN', 'IAH', 'IAD', 'LAX'],
  },
  DAL: {
    icao: 'DAL',
    iata: 'DL',
    name: 'Delta Air Lines',
    shortName: 'Delta',
    callsign: 'DELTA',
    primaryColor: '#C8102E',
    secondaryColor: '#0F172A',
    hubs: ['ATL', 'DTW', 'MSP', 'SLC', 'SEA', 'JFK', 'BOS', 'LAX'],
  },
  AAL: {
    icao: 'AAL',
    iata: 'AA',
    name: 'American Airlines',
    shortName: 'American',
    callsign: 'AMERICAN',
    primaryColor: '#0078D2',
    secondaryColor: '#B91C1C',
    hubs: ['DFW', 'CLT', 'ORD', 'MIA', 'PHX', 'PHL', 'JFK', 'LAX'],
  },
  SWA: {
    icao: 'SWA',
    iata: 'WN',
    name: 'Southwest Airlines',
    shortName: 'Southwest',
    callsign: 'SOUTHWEST',
    primaryColor: '#304CB2',
    secondaryColor: '#F59E0B',
    hubs: ['DEN', 'LAS', 'MDW', 'BWI', 'DAL', 'PHX', 'OAK'],
  },
  JBU: {
    icao: 'JBU',
    iata: 'B6',
    name: 'JetBlue Airways',
    shortName: 'JetBlue',
    callsign: 'JETBLUE',
    primaryColor: '#003876',
    secondaryColor: '#0EA5E9',
    hubs: ['JFK', 'BOS', 'FLL', 'MCO'],
  },
  ASA: {
    icao: 'ASA',
    iata: 'AS',
    name: 'Alaska Airlines',
    shortName: 'Alaska',
    callsign: 'ALASKA',
    primaryColor: '#01426A',
    secondaryColor: '#10B981',
    hubs: ['SEA', 'PDX', 'SFO', 'LAX', 'ANC'],
  },
  NKS: {
    icao: 'NKS',
    iata: 'NK',
    name: 'Spirit Airlines',
    shortName: 'Spirit',
    callsign: 'SPIRIT WINGS',
    primaryColor: '#EAB308',
    secondaryColor: '#111827',
    hubs: ['FLL', 'MCO', 'LAS', 'DTW'],
  },
  FFT: {
    icao: 'FFT',
    iata: 'F9',
    name: 'Frontier Airlines',
    shortName: 'Frontier',
    callsign: 'FRONTIER FLIGHT',
    primaryColor: '#15803D',
    secondaryColor: '#86EFAC',
    hubs: ['DEN', 'MCO', 'LAS', 'PHX'],
  },
  HAL: {
    icao: 'HAL',
    iata: 'HA',
    name: 'Hawaiian Airlines',
    shortName: 'Hawaiian',
    callsign: 'HAWAIIAN',
    primaryColor: '#7C3AED',
    secondaryColor: '#EC4899',
    hubs: ['HNL', 'OGG', 'SFO', 'LAX'],
  },
  FDX: {
    icao: 'FDX',
    iata: 'FX',
    name: 'FedEx Express',
    shortName: 'FedEx',
    callsign: 'FEDEX',
    primaryColor: '#4D148C',
    secondaryColor: '#F97316',
    hubs: ['MEM', 'IND', 'OAK'],
  },
  UPS: {
    icao: 'UPS',
    iata: '5X',
    name: 'UPS Airlines',
    shortName: 'UPS',
    callsign: 'UPS',
    primaryColor: '#351C15',
    secondaryColor: '#FFB500',
    hubs: ['SDF', 'ONT', 'DFW'],
  },
  SKW: {
    icao: 'SKW',
    iata: 'OO',
    name: 'SkyWest Airlines',
    shortName: 'SkyWest',
    callsign: 'SKYWEST',
    primaryColor: '#1D4ED8',
    secondaryColor: '#94A3B8',
    hubs: ['SLC', 'DEN', 'SFO', 'ORD'],
  },
};

export function resolveAirlineFromCallsign(callsign: string): AirlineInfo {
  const cleaned = callsign.trim().toUpperCase();
  const prefix3 = cleaned.slice(0, 3);
  if (US_AIRLINES[prefix3]) return US_AIRLINES[prefix3];

  // Match regional affiliates or common US suffixes
  if (cleaned.startsWith('RPA') || cleaned.startsWith('EDV') || cleaned.startsWith('ENY')) {
    if (cleaned.startsWith('EDV')) return US_AIRLINES.DAL;
    if (cleaned.startsWith('ENY')) return US_AIRLINES.AAL;
    return US_AIRLINES.UAL;
  }

  return {
    icao: prefix3 || 'USA',
    iata: prefix3.slice(0, 2) || 'US',
    name: 'US Commercial / GA',
    shortName: prefix3 || 'US Air',
    callsign: cleaned || 'N/A',
    primaryColor: '#0284C7',
    secondaryColor: '#64748B',
    hubs: [],
  };
}
