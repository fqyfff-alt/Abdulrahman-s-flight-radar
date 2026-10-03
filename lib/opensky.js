/**
 * opensky.js — everything needed to talk to the OpenSky Network REST API.
 *
 * This file is shared by:
 *   - scripts/test-fetch.js  (Stage 1: prints a table of aircraft in the terminal)
 *   - server.js              (Stage 2: the Express backend for the web app)
 * Keeping the API code in one place means we only have to get it right once.
 *
 * It does three jobs:
 *   1. Logs in to OpenSky (OAuth2 "client credentials") and caches the access token.
 *   2. Requests all aircraft inside our bounding box around Muscat.
 *   3. Converts OpenSky's compact arrays into objects with readable names.
 *
 * NOTE: The entry script (test-fetch.js or server.js) must load the .env file
 * with `import 'dotenv/config'` BEFORE calling anything here, because we read
 * OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET from process.env.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * The "bounding box" is a rectangle on the map. OpenSky only returns aircraft
 * inside it.
 *   - Latitude  = how far north of the equator (degrees). Muscat is ~23.6° N.
 *   - Longitude = how far east of Greenwich, London (degrees). Muscat is ~58.4° E.
 *
 * One degree of latitude is always ~111 km, so 22.5°→24.5° is ~222 km north–south.
 * One degree of longitude shrinks as you move away from the equator
 * (111 km × cos(latitude)); at 23.5° N it's ~102 km, so 57°→60° is ~305 km east–west.
 *
 * OpenSky charges API "credits" by box area. Ours is 2° × 3° = 6 square degrees,
 * and anything up to 25 square degrees costs just 1 credit per request.
 */
export const BOUNDING_BOX = {
  lamin: 22.5, // southern edge (minimum latitude)
  lomin: 57.0, // western edge  (minimum longitude)
  lamax: 24.5, // northern edge (maximum latitude)
  lomax: 60.0, // eastern edge  (maximum longitude)
};

const STATES_URL = 'https://opensky-network.org/api/states/all';
const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

// Give up on a request if OpenSky hasn't answered in this many milliseconds.
// Without a timeout, a stuck connection could leave our program waiting forever.
const REQUEST_TIMEOUT_MS = 15_000; // (the _ is just a digit separator: 15_000 === 15000)

// OpenSky tokens last 30 minutes. We fetch a new one 60 seconds *before* the old
// one expires, so a request never goes out with a token that dies on the way.
const TOKEN_REFRESH_MARGIN_MS = 60_000;

// ---------------------------------------------------------------------------
// Authentication (OAuth2 client credentials)
// ---------------------------------------------------------------------------
//
// How OAuth2 "client credentials" works, in plain words:
//   1. We send our client ID + client secret (like a username + password for
//      programs) to OpenSky's login server.
//   2. It replies with an "access token" — a long random string that proves who
//      we are — plus how many seconds it stays valid (expires_in, usually 1800).
//   3. On every API request we send the header  "Authorization: Bearer <token>".
// The secret itself only travels to the login server, never with each request.

// The token we received last time, and the moment it expires
// (in milliseconds since 1 Jan 1970, the same units as Date.now()).
let cachedToken = null;
let tokenExpiresAt = 0;

// So we only print the "anonymous mode" warning once, not on every request.
let hasWarnedAboutAnonymous = false;

/** True when BOTH credentials are present in .env (empty strings count as missing). */
export function hasCredentials() {
  return Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);
}

/**
 * Return a valid access token, reusing the cached one if it's still fresh.
 * Only contacts the login server when we have no token or it's about to expire.
 */
async function getAccessToken() {
  const tokenIsStillFresh =
    cachedToken !== null && Date.now() < tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS;
  if (tokenIsStillFresh) {
    return cachedToken;
  }

  // The login server expects a "form" body (like an HTML form submission).
  // When the body is URLSearchParams, fetch() automatically sets the header
  // Content-Type: application/x-www-form-urlencoded for us.
  const formBody = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.OPENSKY_CLIENT_ID,
    client_secret: process.env.OPENSKY_CLIENT_SECRET,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    body: formBody,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // 400/401 here almost always means a typo in the client ID or secret.
    // We stop with a clear error instead of silently switching to anonymous mode,
    // so you notice the problem instead of mysteriously running out of credits.
    const error = new Error(
      `OpenSky login failed (HTTP ${response.status}). ` +
        'Check OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET in your .env file.',
    );
    error.status = response.status;
    throw error;
  }

  const tokenData = await response.json();
  cachedToken = tokenData.access_token;
  tokenExpiresAt = Date.now() + tokenData.expires_in * 1000; // seconds → milliseconds
  return cachedToken;
}

// ---------------------------------------------------------------------------
// Converting OpenSky's arrays into readable objects
// ---------------------------------------------------------------------------

/**
 * OpenSky sends each aircraft (a "state vector") as a plain array of 17 values,
 * for example:
 *
 *   ["896714", "ETD4UA  ", "United Arab Emirates", 1791008170, 1791008170,
 *    57.9696, 23.5402, 10668, false, 236.7, 79.23, 0, null, 11315.7, "1771", false, 0]
 *
 * Arrays are compact to send over the network, but code like `state[6]` is hard
 * to read. This function gives every value a clear name.
 *
 * Units are kept exactly as OpenSky sends them (metres, metres per second).
 * Converting to aviation units (feet, knots) happens only when displaying,
 * so the "real" data stays in one consistent unit system.
 *
 * Any value can be null when OpenSky doesn't know it.
 */
export function parseStateVector(state) {
  return {
    // [0] ICAO 24-bit transponder address, written in hexadecimal (e.g. "896714").
    //     Every airframe has its own permanent address, like a serial number.
    icao24: state[0],

    // [1] Callsign used on the radio, e.g. "ETD4UA" (Etihad flight 4UA).
    //     OpenSky pads it with spaces to 8 characters, so we trim them off.
    //     `?.` means "only call .trim() if the value isn't null", and
    //     `|| null` turns an empty string "" into null.
    callsign: state[1]?.trim() || null,

    // [2] Country the aircraft is registered in, worked out from its icao24
    //     address. This is NOT where the flight departed from.
    originCountry: state[2],

    // [3] Unix time (seconds since 1 Jan 1970) of the last position report.
    //     null if no position was received in the past 15 seconds.
    timePosition: state[3],

    // [4] Unix time (seconds) of the last message of any kind from this aircraft.
    lastContact: state[4],

    // [5] Longitude in decimal degrees (east is positive).
    longitude: state[5],

    // [6] Latitude in decimal degrees (north is positive).
    latitude: state[6],

    // [7] Barometric altitude in metres: measured by the aircraft's altimeter
    //     from outside air pressure. This is the altitude pilots and air traffic
    //     control use. null when unknown (often for aircraft on the ground).
    baroAltitude: state[7],

    // [8] true if the aircraft reports it is on the ground (taxiing or parked).
    onGround: state[8],

    // [9] Ground speed in metres per second (speed over the ground, which
    //     includes the effect of wind, unlike airspeed).
    velocity: state[9],

    // [10] True track: direction of travel over the ground, in degrees clockwise
    //      from true north (0 = north, 90 = east, 180 = south, 270 = west).
    //      Strictly, "track" is where the plane is GOING; "heading" is where its
    //      nose POINTS. A crosswind makes them differ by a few degrees.
    trueTrack: state[10],

    // [11] Vertical rate in metres per second: positive = climbing,
    //      negative = descending, ~0 = level flight.
    verticalRate: state[11],

    // [12] IDs of the OpenSky receivers that heard this aircraft. Normally null,
    //      because we don't filter by receiver in our request.
    sensors: state[12],

    // [13] Geometric altitude in metres: height measured by satellite navigation
    //      (GPS). It differs from barometric altitude because air pressure
    //      changes with the weather.
    geoAltitude: state[13],

    // [14] Squawk: the 4-digit transponder code assigned by air traffic control,
    //      e.g. "1771". A few codes are reserved worldwide:
    //      7500 = hijacking, 7600 = radio failure, 7700 = general emergency.
    squawk: state[14],

    // [15] Special Purpose Indicator: true when the pilot presses the "IDENT"
    //      button so the controller can pick the aircraft out on their screen.
    spi: state[15],

    // [16] How the position was determined:
    //      0 = ADS-B (the aircraft broadcasts its own GPS position),
    //      1 = ASTERIX (data shared from ground radar),
    //      2 = MLAT (multilateration: position worked out from the tiny time
    //          differences when several receivers hear the same signal),
    //      3 = FLARM (collision-avoidance system used by gliders/light aircraft).
    positionSource: state[16],

    // (There is also an index [17] "category" (airliner, helicopter, glider…),
    //  but OpenSky only includes it if you add extended=1 to the request.)
  };
}

/** True if the aircraft has a usable position (both latitude and longitude). */
function hasPosition(aircraft) {
  // Number.isFinite() is false for null, undefined, and NaN, so it covers
  // every way a coordinate can be missing.
  return Number.isFinite(aircraft.latitude) && Number.isFinite(aircraft.longitude);
}

// ---------------------------------------------------------------------------
// Fetching aircraft
// ---------------------------------------------------------------------------

/**
 * Ask OpenSky for every aircraft inside BOUNDING_BOX.
 *
 * Resolves to:
 *   {
 *     aircraft:         [...],  // cleaned objects, only aircraft with a position
 *     creditsRemaining: 394,    // from the X-Rate-Limit-Remaining header (or null)
 *     openskyTime:      1791008191, // Unix seconds the data is valid for
 *   }
 *
 * Throws an Error if something goes wrong. For HTTP errors, the error has a
 * `status` property (e.g. 429), so callers can react to specific problems. For a
 * 429 it also has `retryAfterSeconds` (how long until credits come back).
 */
export async function fetchAircraft() {
  // Build the URL with the bounding box as query parameters:
  // https://opensky-network.org/api/states/all?lamin=22.5&lomin=57&lamax=24.5&lomax=60
  const url = new URL(STATES_URL);
  for (const [name, value] of Object.entries(BOUNDING_BOX)) {
    url.searchParams.set(name, value);
  }

  const headers = {};
  if (hasCredentials()) {
    headers.Authorization = `Bearer ${await getAccessToken()}`;
  } else if (!hasWarnedAboutAnonymous) {
    console.warn(
      '⚠️  No OpenSky credentials found (OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET in .env).\n' +
        '   Using anonymous access, which is limited to 400 API credits per day.\n' +
        '   See README.md for how to get free credentials (4,000 credits per day).',
    );
    hasWarnedAboutAnonymous = true;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  // Headers are always text, so convert to a number. If the header is missing
  // we use null, meaning "unknown".
  const creditsHeader = response.headers.get('x-rate-limit-remaining');
  const creditsRemaining = creditsHeader === null ? null : Number(creditsHeader);

  if (!response.ok) {
    if (response.status === 401) {
      // The token was rejected. Forget it so the next call logs in again.
      cachedToken = null;
    }
    const error = new Error(`OpenSky request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.creditsRemaining = creditsRemaining;
    if (response.status === 429) {
      // 429 = "Too Many Requests": we've used up our credits for now.
      const retryHeader = response.headers.get('x-rate-limit-retry-after-seconds');
      error.retryAfterSeconds = retryHeader === null ? null : Number(retryHeader);
    }
    throw error;
  }

  const data = await response.json();

  // When the sky is empty, OpenSky sends "states": null instead of an empty
  // array, so `?? []` swaps null for [] ("??" means "if null/undefined, use this").
  const aircraft = (data.states ?? []).map(parseStateVector).filter(hasPosition);

  return {
    aircraft,
    creditsRemaining,
    openskyTime: data.time,
  };
}
