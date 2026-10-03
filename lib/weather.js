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

// ---------------------------------------------------------------------------
// Cleaning: turn the AWC's reports into one consistent, easy-to-use shape
// ---------------------------------------------------------------------------
//
// Things the real data taught us (see `npm run test-weather`):
//   - In a METAR, optional fields (gusts, weather) are LEFT OUT when there's
//     nothing to report. In a TAF they're present but null.
//   - Visibility is in statute miles, sometimes as text: "6+" = 6 or more.
//   - Wind direction can be "VRB" (variable); calm wind is 0 knots.
//   - The METAR JSON drops cloud types (CB, TCU), so we read them from the raw text.

// 1 statute mile (the US land mile) = 1.609344 km exactly.
const KM_PER_STATUTE_MILE = 1.609344;

// Cloud cover codes. Cover is measured in oktas (eighths of the sky):
//   FEW = 1–2 oktas, SCT (scattered) = 3–4, BKN (broken) = 5–7, OVC (overcast) = 8.
//   VV  = vertical visibility: the sky is hidden (e.g. by fog) and this is how
//         far up an observer can see.
const CLOUD_LAYER_CODES = new Set(['FEW', 'SCT', 'BKN', 'OVC', 'VV', 'OVX']);

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * The main part of a METAR, without the trend forecast (TEMPO/BECMG/NOSIG)
 * and remarks (RMK) on the end, which describe something other than "now".
 */
function mainPartOf(rawMetar) {
  return rawMetar.split(/\s(?:TEMPO|BECMG|NOSIG|RMK)\b/)[0];
}

/**
 * Wind → { directionDeg, speedKt, gustKt, isCalm, isVariable }, or null if
 * the report doesn't mention wind (common in TAF "TEMPO" periods).
 *
 * Wind direction is where the wind blows FROM, in degrees from true north:
 * a "north wind" (360°) blows from the north towards the south. Speed is in
 * knots (nautical miles per hour). A gust is a brief burst of stronger wind.
 */
function cleanWind(wdir, wspd, wgst) {
  if (wspd === null || wspd === undefined) {
    return null;
  }
  const isCalm = wspd === 0; // reported as 00000KT
  const isVariable = wdir === 'VRB'; // light, shifting wind with no steady direction
  return {
    directionDeg: !isCalm && typeof wdir === 'number' ? wdir : null,
    speedKt: wspd,
    gustKt: wgst ?? null, // `??` turns "missing" (undefined) into null
    isCalm,
    isVariable,
  };
}

/**
 * Visibility → { km, isAtLeast }, or null if not reported.
 *
 * The AWC gives statute miles. Converting back gives the metric value the
 * airport reported: 2.49 miles → 4.0 km ("4000" in the METAR).
 * "6+" is what the AWC shows for "9999" in metric METARs, the code for
 * "10 km or more", so we show it as 10+ km. ("10+" comes from US airports.)
 */
function cleanVisibility(visib) {
  if (visib === null || visib === undefined) {
    return null;
  }
  if (typeof visib === 'string' && visib.endsWith('+')) {
    const miles = parseFloat(visib);
    return { km: miles === 6 ? 10 : round1(miles * KM_PER_STATUTE_MILE), isAtLeast: true };
  }
  const miles = Number(visib);
  if (!Number.isFinite(miles)) {
    return null;
  }
  return { km: round1(miles * KM_PER_STATUTE_MILE), isAtLeast: false };
}

/**
 * Cloud layers → [{ cover, baseFt, type }], lowest first. Only real layers
 * are kept: an empty list means no significant cloud (codes like NSC, NCD,
 * CLR, SKC, CAVOK). Heights are in feet above the airport.
 * `type` is "CB" (cumulonimbus: thunderstorm cloud), "TCU" (towering
 * cumulus: a growing shower cloud), or null.
 */
function cleanClouds(layers, rawMainPart = '') {
  // The METAR JSON leaves out the type, but the raw text has it, e.g.
  // "SCT030TCU" = scattered, base 030 hundred feet (3,000 ft), towering cumulus.
  const typeByBase = new Map();
  for (const match of rawMainPart.matchAll(/\b(?:FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)\b/g)) {
    typeByBase.set(Number(match[1]) * 100, match[2]);
  }

  return (layers ?? [])
    .filter((layer) => CLOUD_LAYER_CODES.has(layer.cover) && layer.base !== null && layer.base !== undefined)
    .map((layer) => ({
      cover: layer.cover,
      baseFt: layer.base,
      type: layer.type ?? typeByBase.get(layer.base) ?? null,
    }));
}

/** "VCTS SHRA" → ["VCTS", "SHRA"]; nothing reported → []. */
function splitWeatherCodes(wxString) {
  return wxString ? wxString.trim().split(/\s+/) : [];
}

/** Clean a METAR (current weather). Returns null if there is no METAR. */
export function cleanMetar(metar) {
  if (!metar) {
    return null;
  }
  const mainPart = mainPartOf(metar.rawOb);
  const wind = cleanWind(metar.wdir, metar.wspd, metar.wgst);

  // "200V270" in the raw text = the wind direction is swinging between 200°
  // and 270°. The JSON doesn't include this, so we read it from the text.
  if (wind) {
    const range = mainPart.match(/\b(\d{3})V(\d{3})\b/);
    wind.variableFromDeg = range ? Number(range[1]) : null;
    wind.variableToDeg = range ? Number(range[2]) : null;
  }

  return {
    raw: metar.rawOb,
    type: metar.metarType ?? 'METAR', // or "SPECI" (a special report)
    observedAt: metar.obsTime, // Unix seconds
    // Flight category, worked out by the AWC from the cloud base and visibility:
    // VFR (good), MVFR (marginal), IFR (poor), LIFR (very poor).
    flightCategory: metar.fltCat ?? null,
    wind,
    visibility: cleanVisibility(metar.visib),
    temperatureC: metar.temp ?? null,
    dewPointC: metar.dewp ?? null,
    pressureHpa: metar.altim === null || metar.altim === undefined ? null : Math.round(metar.altim),
    clouds: cleanClouds(metar.clouds, mainPart),
    // CAVOK = "Ceiling And Visibility OK": 10 km+ visibility, no cloud below
    // 5,000 ft, no cumulonimbus, and no significant weather.
    cavok: /\bCAVOK\b/.test(mainPart),
    weather: splitWeatherCodes(metar.wxString),
  };
}

/**
 * One TAF forecast period. In TEMPO and PROB periods, anything not mentioned
 * stays the same as before; those fields come out as null or [].
 */
function cleanTafPeriod(period) {
  return {
    from: period.timeFrom, // Unix seconds
    to: period.timeTo,
    // How this period relates to the one before:
    //   null  = the main forecast
    //   FM    = "from": everything changes completely at `from`
    //   BECMG = "becoming": a gradual change between `from` and `becomingBy`
    //   TEMPO = "temporarily": short spells of these conditions now and then
    //   PROB  = a 30% or 40% chance (see `probability`)
    change: period.fcstChange ?? null,
    probability: period.probability ?? null,
    becomingBy: period.timeBec ?? null,
    wind: cleanWind(period.wdir, period.wspd, period.wgst),
    visibility: cleanVisibility(period.visib),
    clouds: cleanClouds(period.clouds),
    weather: splitWeatherCodes(period.wxString),
  };
}

/** Clean a TAF (forecast). Returns null if there is no TAF. */
export function cleanTaf(taf) {
  if (!taf) {
    return null;
  }
  return {
    raw: taf.rawTAF,
    issuedAt: Date.parse(taf.issueTime) / 1000, // ISO text → Unix seconds
    validFrom: taf.validTimeFrom,
    validTo: taf.validTimeTo,
    periods: (taf.fcsts ?? []).map(cleanTafPeriod),
  };
}

/**
 * Fetch both reports and clean them:
 *   { station, metar: {...} | null, taf: {...} | null }
 * Throws if either request fails.
 */
export async function fetchWeather() {
  // Promise.all asks for both at the same time and waits for both answers.
  const [metar, taf] = await Promise.all([fetchMetar(), fetchTaf()]);
  return { station: WEATHER_STATION, metar: cleanMetar(metar), taf: cleanTaf(taf) };
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
