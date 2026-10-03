/**
 * Stage 1 test script: fetch the aircraft over Muscat ONCE and print a table.
 *
 * Run it with:   npm run test-fetch
 *
 * Each run costs 1 OpenSky API credit, so there's no need to run it in a loop.
 */

// Load the .env file into process.env. This MUST be the first import, so the
// credentials are in place before lib/opensky.js reads them.
import 'dotenv/config';

import { BOUNDING_BOX, fetchAircraft, hasCredentials } from '../lib/opensky.js';

// ---------------------------------------------------------------------------
// Unit conversions: OpenSky uses SI units, but aviation mostly uses feet & knots
// ---------------------------------------------------------------------------

// 1 foot is exactly 0.3048 m, so 1 m = 1 / 0.3048 ≈ 3.28084 ft.
const FEET_PER_METRE = 3.28084;

// A knot is one nautical mile per hour. A nautical mile is 1852 m (based on
// one minute of latitude), so 1 knot = 1852 m / 3600 s ≈ 0.5144 m/s,
// and 1 m/s ≈ 1.94384 knots.
const KNOTS_PER_METRE_PER_SECOND = 1.94384;

// Vertical speed is given in feet per minute: multiply m/s by feet-per-metre,
// then by 60 seconds per minute.
const FEET_PER_MINUTE_PER_METRE_PER_SECOND = FEET_PER_METRE * 60; // ≈ 196.85

/** Round a number, or return "—" when the value is missing (null). */
function roundOrDash(value) {
  return value === null ? '—' : Math.round(value);
}

/** Sorting key: highest aircraft first, ground and unknown-altitude ones last. */
function altitudeForSorting(plane) {
  if (plane.onGround || plane.baroAltitude === null) {
    return -1;
  }
  return plane.baroAltitude;
}

/** Turn one aircraft object into a row of human-friendly values for the table. */
function toTableRow(plane) {
  // Altitude: show "ground" for aircraft on the ground, otherwise feet.
  let altitudeFeet;
  if (plane.onGround) {
    altitudeFeet = 'ground';
  } else if (plane.baroAltitude === null) {
    altitudeFeet = '—';
  } else {
    altitudeFeet = Math.round(plane.baroAltitude * FEET_PER_METRE);
  }

  return {
    ICAO24: plane.icao24,
    Callsign: plane.callsign ?? '—',
    Country: plane.originCountry,
    'Alt (ft)': altitudeFeet,
    'Speed (kt)': roundOrDash(
      plane.velocity === null ? null : plane.velocity * KNOTS_PER_METRE_PER_SECOND,
    ),
    'Track (°)': roundOrDash(plane.trueTrack),
    'V/S (fpm)': roundOrDash(
      plane.verticalRate === null
        ? null
        : plane.verticalRate * FEET_PER_MINUTE_PER_METRE_PER_SECOND,
    ),
    Squawk: plane.squawk ?? '—',
    Lat: Number(plane.latitude.toFixed(3)),
    Lon: Number(plane.longitude.toFixed(3)),
  };
}

/**
 * Format a Unix timestamp (seconds) as a time in UTC and in Muscat local time.
 * Aviation runs on UTC (also called "Zulu" time) so that pilots and controllers
 * in different countries never mix up time zones. Muscat is UTC+4 all year.
 */
function formatTime(unixSeconds) {
  const date = new Date(unixSeconds * 1000); // JavaScript dates use milliseconds
  const utc = date.toLocaleTimeString('en-GB', { timeZone: 'UTC' });
  const muscat = date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Muscat' });
  return `${utc} UTC (${muscat} Muscat time)`;
}

/** Explain common errors in plain language. */
function explainError(error) {
  if (error.status === 429) {
    const wait = error.retryAfterSeconds
      ? ` Credits come back in about ${Math.ceil(error.retryAfterSeconds / 60)} minutes.`
      : '';
    return `OpenSky says you're out of API credits for now (HTTP 429).${wait}`;
  }
  if (error.name === 'TimeoutError') {
    return 'OpenSky did not answer in time. It may be busy — try again in a minute.';
  }
  if (error.message === 'fetch failed') {
    // fetch() hides the real network problem in error.cause (e.g. ENOTFOUND = no DNS).
    return `Could not reach OpenSky (${error.cause?.code ?? error.cause?.message}). Check your internet connection.`;
  }
  return error.message;
}

async function main() {
  const { lamin, lamax, lomin, lomax } = BOUNDING_BOX;
  console.log(`Fetching aircraft between latitude ${lamin}–${lamax}° N and longitude ${lomin}–${lomax}° E…`);
  console.log(`Mode: ${hasCredentials() ? 'authenticated (OAuth2 token)' : 'anonymous'}\n`);

  const { aircraft, creditsRemaining, openskyTime } = await fetchAircraft();

  if (aircraft.length === 0) {
    console.log('No aircraft in the area right now. (Quiet skies happen, especially late at night.)');
  } else {
    // Sort highest first. sort() calls our function with pairs of planes:
    // a negative result puts `a` first, a positive result puts `b` first.
    const sorted = [...aircraft].sort((a, b) => altitudeForSorting(b) - altitudeForSorting(a));

    // Print an ARRAY of rows. (An earlier version used an object keyed by
    // icao24, but JavaScript objects list keys that look like whole numbers,
    // such as "500472", first, no matter when they were added. That broke
    // the altitude sorting. Arrays always keep their order.)
    console.table(sorted.map(toTableRow));
  }

  console.log(`\nAircraft with a position: ${aircraft.length}`);
  console.log(`Data time:                ${formatTime(openskyTime)}`);
  console.log(`API credits remaining:    ${creditsRemaining ?? 'unknown'}`);
}

try {
  await main(); // "top-level await" is allowed because this file is an ES module
} catch (error) {
  console.error(`\n❌ ${explainError(error)}`);
  process.exitCode = 1; // tell the terminal the script failed
}
