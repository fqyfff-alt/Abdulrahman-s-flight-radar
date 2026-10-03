/**
 * weather.js — fetches aviation weather for Muscat International Airport
 * (OOMS) from the Aviation Weather Center (AWC), part of the US National
 * Weather Service. It's free and needs no API key.
 *
 * There are two kinds of report:
 *   METAR: the CURRENT weather, measured at the airport. Airports issue one
 *          every 30 or 60 minutes (plus extra "SPECI" reports when the
 *          weather changes suddenly).
 *   TAF:   the Terminal Aerodrome Forecast: what the weather is expected to
 *          do at the airport over the next 24–30 hours.
 *
 * Shared by scripts/test-weather.js (prints the reports) and server.js.
 */

const AWC_BASE_URL = 'https://aviationweather.gov/api/data';

// ICAO airport code: the 4-letter code pilots use. O = Middle East region,
// O = Oman, MS = Muscat. (Its IATA code, on tickets, is MCT.)
export const WEATHER_STATION = 'OOMS';

// A User-Agent header tells the server which program is asking. The AWC asks
// apps to identify themselves, so they can contact the owner if something goes wrong.
const USER_AGENT =
  'MuscatAirspace/1.0 (student flight tracker; https://github.com/fqyfff-alt/Abdulrahman-s-flight-radar)';

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Fetch one product ("metar" or "taf") for our airport.
 * Resolves to the report object, or null if the airport has no report right now.
 */
async function fetchAwcReport(product) {
  const url = `${AWC_BASE_URL}/${product}?ids=${WEATHER_STATION}&format=json`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  // 204 "No Content" means the request was fine but there's no report. The
  // body is completely empty, so trying to read it as JSON would crash.
  if (response.status === 204) {
    return null;
  }
  if (!response.ok) {
    const error = new Error(`Aviation Weather Center request failed (HTTP ${response.status})`);
    error.status = response.status;
    throw error;
  }

  // The API always answers with a list (you can ask for several airports at
  // once). We asked for one airport, so we want the first entry.
  const reports = await response.json();
  return reports[0] ?? null;
}

/** The latest METAR (current weather) for OOMS, or null. */
export function fetchMetar() {
  return fetchAwcReport('metar');
}

/** The latest TAF (forecast) for OOMS, or null. */
export function fetchTaf() {
  return fetchAwcReport('taf');
}

/** Explain a weather fetch error in plain language. */
export function describeWeatherError(error) {
  if (error.name === 'TimeoutError') {
    return 'The Aviation Weather Center did not answer in time.';
  }
  if (error.message === 'fetch failed') {
    return `Could not reach aviationweather.gov (${error.cause?.code ?? error.cause?.message}).`;
  }
  return error.message;
}
