/**
 * format.js — unit conversions and text formatting for display.
 *
 * Our server sends OpenSky's SI units (metres, metres per second). Pilots and
 * air traffic controllers use feet for altitude, knots for speed, and feet per
 * minute for climb/descent, so we convert only at the moment we display.
 */

import { LOW_ALTITUDE_MAX_FEET, MID_ALTITUDE_MAX_FEET } from './config.js';

// ---------------------------------------------------------------------------
// Unit conversions
// ---------------------------------------------------------------------------

// 1 foot is exactly 0.3048 m, so 1 m = 1 / 0.3048 ≈ 3.28084 ft.
const FEET_PER_METRE = 3.28084;

// 1 knot = 1 nautical mile per hour = 1852 m / 3600 s ≈ 0.5144 m/s,
// so 1 m/s ≈ 1.94384 knots.
const KNOTS_PER_METRE_PER_SECOND = 1.94384;

// m/s → ft/min: metres to feet, then seconds to minutes (× 60).
const FEET_PER_MINUTE_PER_METRE_PER_SECOND = FEET_PER_METRE * 60; // ≈ 196.85

// Climb or descent slower than this (ft/min) counts as "level flight".
// ADS-B transponders report vertical rate in steps of 64 ft/min, and aircraft
// cruising in light turbulence bob up and down by a step or so, so ±64 really
// means "level".
const LEVEL_FLIGHT_THRESHOLD_FPM = 100;

export function metresToFeet(metres) {
  return metres * FEET_PER_METRE;
}

export function metresPerSecondToKnots(metresPerSecond) {
  return metresPerSecond * KNOTS_PER_METRE_PER_SECOND;
}

export function metresPerSecondToFeetPerMinute(metresPerSecond) {
  return metresPerSecond * FEET_PER_MINUTE_PER_METRE_PER_SECOND;
}

// ---------------------------------------------------------------------------
// Altitude colour bands
// ---------------------------------------------------------------------------

/**
 * Which altitude band a plane is in: 'ground', 'low', 'mid', 'high', or
 * 'unknown'. style.css turns each band into a colour through the classes
 * .alt-ground, .alt-low, .alt-mid and .alt-high. (Unknown stays white.)
 */
export function getAltitudeBand(plane) {
  if (plane.onGround) {
    return 'ground';
  }
  const altitudeMetres = plane.baroAltitude ?? plane.geoAltitude; // prefer barometric
  if (altitudeMetres === null) {
    return 'unknown';
  }
  // Round first, so the colour always matches the number shown in the popup.
  // (Without rounding, 7,620 m converts to 25,000.0008 ft: displayed as
  // "25,000 ft" but coloured as "above 25,000". Transponders report altitude
  // in 25 ft steps, so exactly 25,000 ft is common.)
  const altitudeFeet = Math.round(metresToFeet(altitudeMetres));
  if (altitudeFeet < LOW_ALTITUDE_MAX_FEET) {
    return 'low';
  }
  if (altitudeFeet <= MID_ALTITUDE_MAX_FEET) {
    return 'mid';
  }
  return 'high';
}

// ---------------------------------------------------------------------------
// Text formatting
// ---------------------------------------------------------------------------

/** Round and add thousands separators: 32975.4 → "32,975". */
export function formatNumber(value) {
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Altitude for display: "33,000 ft", "On ground", or "—" if unknown.
 * We prefer barometric altitude (what pilots and ATC use). If it's missing we
 * fall back to GPS (geometric) altitude and say so.
 */
export function formatAltitude(plane) {
  if (plane.onGround) {
    return 'On ground';
  }
  if (plane.baroAltitude !== null) {
    return `${formatNumber(metresToFeet(plane.baroAltitude))} ft`;
  }
  if (plane.geoAltitude !== null) {
    return `${formatNumber(metresToFeet(plane.geoAltitude))} ft (GPS)`;
  }
  return '—';
}

/** Ground speed for display: "462 kt". */
export function formatSpeed(metresPerSecond) {
  if (metresPerSecond === null) {
    return '—';
  }
  return `${formatNumber(metresPerSecondToKnots(metresPerSecond))} kt`;
}

/**
 * Heading for display: "070°".
 * Aviation always writes directions with three digits (005°, 090°, 270°) so
 * they can't be misheard, and uses 360° rather than 000° for north.
 */
export function formatHeading(degrees) {
  if (degrees === null) {
    return '—';
  }
  const rounded = Math.round(degrees) % 360 || 360; // "|| 360" turns 0 into 360
  return `${String(rounded).padStart(3, '0')}°`;
}

/**
 * Describe the vertical rate as a trend + arrow + text, e.g.
 *   { trend: 'climb', label: 'climbing', arrow: '▲', text: '+1,280 fpm' }
 * The arrow's colour comes from CSS, based on `trend`.
 */
export function describeVerticalRate(metresPerSecond) {
  if (metresPerSecond === null) {
    return { trend: 'unknown', label: 'unknown', arrow: '', text: '—' };
  }
  const feetPerMinute = metresPerSecondToFeetPerMinute(metresPerSecond);
  if (Math.abs(feetPerMinute) < LEVEL_FLIGHT_THRESHOLD_FPM) {
    return { trend: 'level', label: 'level', arrow: '—', text: 'Level' };
  }
  if (feetPerMinute > 0) {
    return { trend: 'climb', label: 'climbing', arrow: '▲', text: `+${formatNumber(feetPerMinute)} fpm` };
  }
  // formatNumber keeps the minus sign for negative numbers.
  return { trend: 'descend', label: 'descending', arrow: '▼', text: `${formatNumber(feetPerMinute)} fpm` };
}

/** The name we show for a plane: its callsign, or its ICAO address if it has none. */
export function displayName(plane) {
  return plane.callsign ?? plane.icao24.toUpperCase();
}

/** A distance for display: 4.24 → "4.2 km", 37.6 → "38 km". */
export function formatDistanceKm(kilometres) {
  return kilometres < 10 ? `${kilometres.toFixed(1)} km` : `${Math.round(kilometres)} km`;
}

/** A rough time for display: 0.4 → "<1 min", 6.2 → "~6 min", null → "—". */
export function formatMinutes(minutes) {
  if (minutes === null) {
    return '—';
  }
  return minutes < 1 ? '<1 min' : `~${Math.round(minutes)} min`;
}

/** A Unix time (seconds) as a local clock time, e.g. "10:26:00". */
export function formatClockTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-GB');
}

/** A duration for display: 45 → "45 s", 250 → "4 min". */
export function formatAge(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)} s`;
  }
  return `${Math.floor(seconds / 60)} min`;
}

/**
 * Make text safe to put inside HTML. Data from outside (like a callsign) could
 * in theory contain characters such as < or > that the browser would treat as
 * HTML tags. Replacing them with "entities" (&lt; &gt;) shows them as plain text.
 * Always do this before inserting outside data into an HTML string.
 */
export function escapeHtml(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, (character) => entities[character]);
}
