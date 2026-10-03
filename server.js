/**
 * server.js — the backend for Muscat Airspace.
 *
 * Run it with:   npm start        (or  npm run dev  to auto-restart when you edit code)
 *
 * Why have a backend at all? Why not call OpenSky straight from the browser?
 *   1. Secrets: the OpenSky client secret must stay private. Anything sent to a
 *      browser can be read by whoever opens the page (View Source / DevTools).
 *   2. Credits: the server keeps ONE shared cache, so ten open browser tabs
 *      cost the same OpenSky credits as one.
 *   3. Browsers aren't allowed anyway: OpenSky's API sends the header
 *      "Access-Control-Allow-Origin: https://opensky-network.org", which tells
 *      browsers to block requests from pages on any other website (this rule is
 *      called CORS). Servers don't follow CORS, so our server can ask freely.
 *   4. Clean data: the server turns OpenSky's arrays into named objects, so the
 *      frontend code stays simple.
 *
 * What it does:
 *   GET /api/aircraft  → JSON with the aircraft over Muscat (cached for 20 s)
 *   GET /api/weather   → JSON with the weather at Muscat airport (cached for 10 min)
 *   GET /api/config    → settings the page needs (the map-tile key)
 *   GET /anything-else → files from the /public folder (the web page)
 */

// Load .env into process.env FIRST, before anything reads the credentials.
import 'dotenv/config';

import express from 'express';
import { fileURLToPath } from 'node:url';

import { describeError, fetchAircraft, hasCredentials } from './lib/opensky.js';
import { describeWeatherError, fetchWeather } from './lib/weather.js';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// The port is the "door number" the server listens on: http://localhost:3000.
// You can change it in .env with PORT=4000 if 3000 is already in use.
const PORT = Number(process.env.PORT) || 3000;

// How long a response from OpenSky stays "fresh". Within this window every
// request is answered from memory and costs no credits.
const CACHE_DURATION_MS = 20_000;

// After a 429 (rate limited), OpenSky normally tells us how long to wait. If it
// doesn't, we pause for this many seconds before trying again.
const DEFAULT_RATE_LIMIT_PAUSE_SECONDS = 60;

// The absolute path to the /public folder, worked out from where THIS file is,
// so the server finds it no matter which folder you start it from.
// (import.meta.url is this file's location, as a file:// URL.)
const PUBLIC_FOLDER = fileURLToPath(new URL('./public', import.meta.url));

// ---------------------------------------------------------------------------
// The cache: remembered results live in these variables, in the server's memory
// ---------------------------------------------------------------------------

// Last good result from OpenSky: { timestamp, creditsRemaining, aircraft }.
let cachedData = null;

// When cachedData was saved (milliseconds, from Date.now()).
let cachedAt = 0;

// While rate limited, don't contact OpenSky again until this moment (ms).
let rateLimitedUntil = 0;

// If a request to OpenSky is already on its way, this holds its Promise.
// A Promise is JavaScript's "I'll have the answer for you later" object.
let requestInProgress = null;

/** Print a message with the current time in front, e.g. "[10:26:00] ...". */
function log(message) {
  console.log(`[${new Date().toLocaleTimeString('en-GB')}] ${message}`);
}

/**
 * Build the JSON we send to the browser, from whatever is in the cache.
 * The short summary fields come first and the long aircraft list last, so the
 * JSON is easy to read when you open /api/aircraft in a browser.
 */
function buildResponse({ fromCache, rateLimited = false }) {
  return {
    // When OpenSky says these positions were valid (Unix time in seconds).
    timestamp: cachedData?.timestamp ?? null,
    aircraftCount: cachedData?.aircraft.length ?? 0,
    // Credits left today, from OpenSky's X-Rate-Limit-Remaining header.
    // While rate limited it's 0 by definition.
    creditsRemaining: rateLimited ? 0 : (cachedData?.creditsRemaining ?? null),
    rateLimited,
    // While rate limited: seconds until we'll try OpenSky again.
    retryAfterSeconds: rateLimited ? Math.ceil((rateLimitedUntil - Date.now()) / 1000) : null,
    // true = answered from memory, false = fresh from OpenSky just now.
    fromCache,
    aircraft: cachedData?.aircraft ?? [],
  };
}

/**
 * Ask OpenSky for new data and save it in the cache.
 * If OpenSky says "429 Too Many Requests", we don't fail: we answer with the
 * old cached data plus rateLimited: true, and stop asking OpenSky until its
 * retry-after time has passed (asking again early would just get another 429).
 */
async function refreshFromOpenSky() {
  try {
    const result = await fetchAircraft();
    cachedData = {
      timestamp: result.openskyTime,
      creditsRemaining: result.creditsRemaining,
      aircraft: result.aircraft,
    };
    cachedAt = Date.now();
    log(`OpenSky: ${result.aircraft.length} aircraft, ${result.creditsRemaining ?? '?'} credits left`);
    return buildResponse({ fromCache: false });
  } catch (error) {
    if (error.status !== 429) {
      throw error; // a different problem: let the route handler report it
    }
    const pauseSeconds = error.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_PAUSE_SECONDS;
    rateLimitedUntil = Date.now() + pauseSeconds * 1000;
    const servingWhat = cachedData !== null ? 'the last cached data' : 'an empty list (nothing cached yet)';
    log(`OpenSky rate limit reached (429). Pausing requests for ${pauseSeconds} s and serving ${servingWhat}.`);
    return buildResponse({ fromCache: cachedData !== null, rateLimited: true });
  }
}

/** Return aircraft data: from the cache if it's fresh, otherwise from OpenSky. */
async function getAircraftData() {
  // 1. Cache still fresh? Answer from memory: fast, and costs no credits.
  const cacheAgeMs = Date.now() - cachedAt;
  if (cachedData !== null && cacheAgeMs < CACHE_DURATION_MS) {
    log(`Served from cache (${Math.round(cacheAgeMs / 1000)} s old)`);
    return buildResponse({ fromCache: true });
  }

  // 2. Still inside a rate-limit pause? Don't bother OpenSky; serve old data.
  if (Date.now() < rateLimitedUntil) {
    return buildResponse({ fromCache: cachedData !== null, rateLimited: true });
  }

  // 3. Ask OpenSky. If two browser tabs ask at the same moment, the second one
  //    waits for the first one's request instead of starting another. Otherwise
  //    both would see an expired cache and we'd pay for two identical requests.
  if (requestInProgress === null) {
    requestInProgress = refreshFromOpenSky().finally(() => {
      requestInProgress = null; // done (success or failure): allow new requests
    });
  }
  return requestInProgress;
}

// ---------------------------------------------------------------------------
// Weather at Muscat airport (see lib/weather.js)
// ---------------------------------------------------------------------------

// METARs are only issued every 30–60 minutes, so asking more often than every
// 10 minutes would just return the same report again.
const WEATHER_CACHE_DURATION_MS = 10 * 60_000;

// After a failed request, wait this long before asking the AWC again.
const WEATHER_RETRY_PAUSE_MS = 60_000;

let cachedWeather = null; // last good result from fetchWeather()
let weatherCachedAt = 0; // when it was saved (ms)
let weatherRetryAt = 0; // after a failure: don't try again before this moment (ms)
let lastWeatherError = null; // plain-language message for the last failure
let weatherRequestInProgress = null; // Promise of a request on its way

/** A short one-line description of the weather, for the terminal log. */
function describeWeatherForLog({ metar }) {
  if (!metar) {
    return 'no METAR available';
  }
  const time = new Date(metar.observedAt * 1000).toLocaleTimeString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  });
  const { wind } = metar;
  let windText = 'unknown';
  if (wind?.isCalm) {
    windText = 'calm';
  } else if (wind) {
    const direction = wind.isVariable ? 'VRB' : `${String(wind.directionDeg).padStart(3, '0')}°`;
    windText = `${direction} ${wind.speedKt} kt${wind.gustKt ? ` gusting ${wind.gustKt}` : ''}`;
  }
  return `METAR ${time} UTC, ${metar.flightCategory ?? '?'}, wind ${windText}, ${metar.temperatureC ?? '?'}°C`;
}

/**
 * Fetch fresh weather and save it. If the AWC can't be reached, answer with
 * the last good weather marked `stale: true`. With nothing saved yet, throw,
 * so the route can send an error.
 */
async function refreshWeather() {
  try {
    const weather = await fetchWeather();
    cachedWeather = { ...weather, fetchedAt: Math.floor(Date.now() / 1000) };
    weatherCachedAt = Date.now();
    lastWeatherError = null;
    log(`Weather: ${describeWeatherForLog(weather)}`);
    return { ...cachedWeather, stale: false, fromCache: false };
  } catch (error) {
    lastWeatherError = describeWeatherError(error);
    weatherRetryAt = Date.now() + WEATHER_RETRY_PAUSE_MS;
    log(`Weather error: ${lastWeatherError}${cachedWeather ? ' (serving the last good weather, marked stale)' : ''}`);
    if (cachedWeather) {
      return { ...cachedWeather, stale: true, fromCache: true, error: lastWeatherError };
    }
    throw error;
  }
}

/** Return the weather: from the cache if it's fresh, otherwise from the AWC. */
async function getWeather() {
  // 1. Fresh enough? Answer from memory.
  if (cachedWeather && Date.now() - weatherCachedAt < WEATHER_CACHE_DURATION_MS) {
    return { ...cachedWeather, stale: false, fromCache: true };
  }

  // 2. A request failed a moment ago? Don't hammer the AWC; reuse what we have.
  if (Date.now() < weatherRetryAt) {
    if (cachedWeather) {
      return { ...cachedWeather, stale: true, fromCache: true, error: lastWeatherError };
    }
    throw new Error(lastWeatherError);
  }

  // 3. Ask the AWC, sharing one request between visitors who ask at the same moment.
  if (weatherRequestInProgress === null) {
    weatherRequestInProgress = refreshWeather().finally(() => {
      weatherRequestInProgress = null;
    });
  }
  return weatherRequestInProgress;
}

// ---------------------------------------------------------------------------
// The web server
// ---------------------------------------------------------------------------

const app = express();

// Our API route. "async" lets us use "await" inside it.
app.get('/api/aircraft', async (request, response) => {
  try {
    const data = await getAircraftData();
    response.json(data);
  } catch (error) {
    const message = describeError(error);
    log(`Error: ${message}`);
    // 502 "Bad Gateway" means: "this server is fine, but the server it depends
    // on (OpenSky) gave it a problem."
    response.status(502).json({ error: message });
  }
});

// The weather at Muscat airport. If there's no weather to give at all (the AWC
// is down and nothing is cached yet), answer with 503 "Service Unavailable"
// and the same JSON shape with null reports, so the page can show "no
// weather" without crashing.
app.get('/api/weather', async (request, response) => {
  try {
    response.json(await getWeather());
  } catch (error) {
    response.status(503).json({
      error: describeWeatherError(error),
      stale: false,
      metar: null,
      taf: null,
    });
  }
});

// Settings the web page needs at startup. Right now that's just the CARTO
// map-tile key. Unlike the OpenSky secret, this key is NOT really secret:
// browsers have to put it in every tile address, so anyone can see it. We
// still keep it in .env so it isn't uploaded to GitHub, and you can lock it to
// your own websites in CARTO's dashboard so nobody else can use up your quota.
app.get('/api/config', (request, response) => {
  response.json({ cartoApiKey: process.env.CARTO_API_KEY || null });
});

// Any other /api/... address doesn't exist: answer with a JSON 404 error
// (instead of Express's default HTML page, which is awkward for code to read).
app.use('/api', (request, response) => {
  response.status(404).json({ error: `No such API route: ${request.method} ${request.originalUrl}` });
});

// Everything else: serve files from /public. A request for "/" gets
// public/index.html, "/css/style.css" gets public/css/style.css, and so on.
app.use(express.static(PUBLIC_FOLDER));

// Start listening. In Express 5, if starting fails (for example, the port is
// already taken by another program), this callback receives the error.
app.listen(PORT, (error) => {
  if (error) {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `❌ Port ${PORT} is already in use. Is the server already running in another terminal?\n` +
          '   Stop that one (Ctrl+C), or choose another port, e.g. add PORT=3001 to your .env file.',
      );
    } else {
      console.error(`❌ Could not start the server: ${error.message}`);
    }
    process.exit(1);
  }

  console.log(`✈️  Muscat Airspace server running at http://localhost:${PORT}`);
  console.log(`   Aircraft API:  http://localhost:${PORT}/api/aircraft`);
  console.log(`   Weather API:   http://localhost:${PORT}/api/weather`);
  console.log(
    `   OpenSky mode:  ${hasCredentials() ? 'authenticated (4,000 credits/day)' : 'anonymous (400 credits/day)'}`,
  );
  console.log(
    `   Map tiles:     ${process.env.CARTO_API_KEY ? 'CARTO key set' : '⚠️  no CARTO_API_KEY in .env, so tiles will show an "API key required" watermark (free key: see README)'}`,
  );
  console.log('   Press Ctrl+C to stop.\n');
});
