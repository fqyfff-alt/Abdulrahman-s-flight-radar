/**
 * format.js — unit conversions and text formatting for display.
 *
 * Our server sends OpenSky's SI units (metres, metres per second). Pilots and
 * air traffic controllers use feet for altitude, knots for speed, and feet per
 * minute for climb/descent, so we convert only at the moment we display.
 */

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
