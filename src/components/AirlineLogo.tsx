import type { FC } from 'react';
import { US_AIRLINES } from '../lib/airlines.ts';

type AirlineLogoProps = {
  icao: string;
  size?: number;
  className?: string;
};

export const AirlineLogo: FC<AirlineLogoProps> = ({ icao, size = 28, className = '' }) => {
  const code = icao.toUpperCase();
  const info = US_AIRLINES[code];
  const bg = info?.primaryColor || '#0284C7';
  const accent = info?.secondaryColor || '#38BDF8';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 rounded-md ${className}`}
      role="img"
      aria-label={info ? `${info.name} logo` : `${code} aviation emblem`}
    >
      <rect width="32" height="32" rx="7" fill={bg} />
      {code === 'UAL' && (
        <>
          <circle cx="16" cy="16" r="9.5" stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.9" />
          <path d="M8 16H24M16 6.5C19 10 19 22 16 25.5M16 6.5C13 10 13 22 16 25.5M9.5 11.5H22.5M9.5 20.5H22.5" stroke={accent} strokeWidth="1.3" />
        </>
      )}
      {code === 'DAL' && (
        <>
          <path d="M16 5L26 24.5H6L16 5Z" fill="#FFFFFF" fillOpacity="0.95" />
          <path d="M16 11L21.5 22H10.5L16 11Z" fill={bg} />
          <path d="M16 15L19 21H13L16 15Z" fill={accent} />
        </>
      )}
      {code === 'AAL' && (
        <>
          <path d="M7 22L16.5 8H21L13.5 22H7Z" fill="#FFFFFF" />
          <path d="M14.5 22L22 10.5H26L19.5 22H14.5Z" fill={accent} />
          <path d="M6 15.5H25" stroke="#E2E8F0" strokeWidth="1.6" />
        </>
      )}
      {code === 'SWA' && (
        <>
          <path d="M16 25.5C16 25.5 7 19.8 7 12.8C7 9.8 9.4 7.5 12.3 7.5C14 7.5 15.3 8.4 16 9.6C16.7 8.4 18 7.5 19.7 7.5C22.6 7.5 25 9.8 25 12.8C25 19.8 16 25.5 16 25.5Z" fill={accent} />
          <path d="M8.5 13.5C12 16.5 19.5 16.5 23.5 13.5" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" />
        </>
      )}
      {code === 'JBU' && (
        <>
          <rect x="6" y="7" width="20" height="4" rx="1.5" fill="#FFFFFF" />
          <rect x="6" y="14" width="20" height="4" rx="1.5" fill={accent} />
          <rect x="6" y="21" width="13" height="4" rx="1.5" fill="#FFFFFF" fillOpacity="0.85" />
        </>
      )}
      {code === 'ASA' && (
        <>
          <path d="M6 22L13.5 10L18.5 17L22 12L26 22H6Z" fill="#FFFFFF" fillOpacity="0.95" />
          <path d="M11 22L16 14.5L21 22H11Z" fill={accent} />
        </>
      )}
      {code === 'NKS' && (
        <>
          <path d="M8 10H24L21 15H11L8 10Z" fill="#111827" />
          <path d="M10 17.5H22L19 22.5H13L10 17.5Z" fill="#111827" />
        </>
      )}
      {code === 'FFT' && (
        <>
          <path d="M9 23V9H23V13.5H13.5V15.5H21V19.5H13.5V23H9Z" fill="#FFFFFF" />
          <circle cx="22" cy="21" r="2.5" fill={accent} />
        </>
      )}
      {code === 'HAL' && (
        <>
          <circle cx="16" cy="16" r="8" fill={accent} fillOpacity="0.9" />
          <path d="M10 18C13 12 19 10 23 13C20 18 15 21 10 18Z" fill="#FFFFFF" />
        </>
      )}
      {(code === 'FDX' || code === 'UPS') && (
        <>
          <path d="M7 11H25V21H7V11Z" fill="#FFFFFF" fillOpacity="0.16" />
          <path d="M10 16H22M18 12L22 16L18 20" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {!['UAL', 'DAL', 'AAL', 'SWA', 'JBU', 'ASA', 'NKS', 'FFT', 'HAL', 'FDX', 'UPS'].includes(code) && (
        <>
          <path d="M16 6L18.5 14L26 16.5L18.5 18.5L16 26L13.5 18.5L6 16.5L13.5 14L16 6Z" fill="#FFFFFF" fillOpacity="0.92" />
        </>
      )}
    </svg>
  );
};
