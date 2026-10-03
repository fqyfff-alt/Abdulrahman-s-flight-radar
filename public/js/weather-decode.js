/**
 * weather-decode.js — turns aviation weather codes into plain English:
 * weather codes (HZ, -TSRA…), cloud layers, wind directions, and a one-line
 * summary of the current weather.
 */

// ---------------------------------------------------------------------------
// Present-weather codes
// ---------------------------------------------------------------------------
//
// A weather group is built from up to three parts, always in this order:
//   1. intensity or nearness:  "-" light, "+" heavy, nothing = moderate,
//                              "VC" = in the vicinity (roughly 8–16 km away,
//                              but not at the airport itself)
//   2. a descriptor:           SH showers, TS thunderstorm, BL blowing, …
//   3. one or more phenomena:  RA rain, DU dust, HZ haze, …
// Examples:  "-SHRA" = light rain showers,  "+TSRA" = heavy thunderstorm with
// rain,  "BLSA" = blowing sand,  "VCTS" = thunderstorm nearby.

export const WEATHER_DESCRIPTORS = {
  MI: 'shallow',
  PR: 'partial',
  BC: 'patches of',
  DR: 'low drifting', // blown along the ground, below eye level
  BL: 'blowing', // blown up to eye level or higher
  SH: 'showers',
  TS: 'thunderstorm',
  FZ: 'freezing',
};

export const WEATHER_PHENOMENA = {
  // Precipitation (water falling from the sky)
  DZ: 'drizzle',
  RA: 'rain',
  SN: 'snow',
  SG: 'snow grains',
  IC: 'ice crystals',
  PL: 'ice pellets',
  GR: 'hail',
  GS: 'small hail',
  UP: 'unknown precipitation',
  // Obscurations (things in the air that reduce visibility)
  BR: 'mist', // like fog but thinner: visibility 1–5 km
  FG: 'fog', // visibility below 1 km
  FU: 'smoke',
  VA: 'volcanic ash',
  DU: 'dust', // widespread dust hanging in the air: common in Oman
  SA: 'sand',
  HZ: 'haze', // tiny dry particles (dust, salt, pollution): common in the Gulf
  PY: 'spray',
  // Other
  PO: 'dust or sand whirls',
  SQ: 'squalls', // sudden, strong increases in wind
  FC: 'funnel cloud',
  SS: 'sandstorm',
  DS: 'duststorm',
};

/** "light rain and drizzle": join a list with commas and "and". */
function joinWithAnd(words) {
  if (words.length <= 1) {
    return words.join('');
  }
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

export function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * Decode one weather group, e.g. "-TSRA" → "light thunderstorm with rain".
 * Anything we don't recognise is returned unchanged.
 */
export function decodeWeatherCode(code) {
  if (code === 'NSW') {
    return 'no significant weather'; // used in forecasts: "the weather stops"
  }
  const match = code.match(/^(RE)?(-|\+|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:[A-Z]{2})*)$/);
  if (!match) {
    return code;
  }
  const [, recent, prefix, descriptor, phenomenaText] = match;
  const phenomenaCodes = phenomenaText.match(/[A-Z]{2}/g) ?? [];
  if (phenomenaCodes.some((part) => !WEATHER_PHENOMENA[part])) {
    return code; // contains something we don't know
  }
  const phenomena = joinWithAnd(phenomenaCodes.map((part) => WEATHER_PHENOMENA[part]));

  let text;
  if (descriptor === 'TS') {
    text = phenomena ? `thunderstorm with ${phenomena}` : 'thunderstorm';
  } else if (descriptor === 'SH') {
    text = phenomena ? `${phenomena} showers` : 'showers';
  } else if (descriptor) {
    text = `${WEATHER_DESCRIPTORS[descriptor]} ${phenomena}`.trim();
  } else {
    text = phenomena;
  }

  if (prefix === '-') {
    text = `light ${text}`;
  } else if (prefix === '+') {
    text = phenomenaText === 'FC' ? 'tornado or waterspout' : `heavy ${text}`;
  } else if (prefix === 'VC') {
    text = `${text} nearby (not at the airport)`;
  }
  if (recent) {
    text = `recent ${text} (has just stopped)`;
  }
  return text;
}

/** A list of weather codes in words: ["HZ", "-RA"] → "haze and light rain". */
export function describeWeather(codes) {
  return joinWithAnd(codes.map(decodeWeatherCode));
}

// ---------------------------------------------------------------------------
// Clouds
// ---------------------------------------------------------------------------
//
// Cloud cover is measured in oktas: eighths of the sky.
//   FEW = 1–2 oktas, SCT (scattered) = 3–4, BKN (broken) = 5–7, OVC (overcast) = 8.
// Heights are in feet above the airport, not above sea level.

const CLOUD_COVER_WORDS = { FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast' };

/** One layer: "Scattered at 3,000 ft (towering cumulus)". */
export function describeCloudLayer(layer) {
  const height = `${layer.baseFt.toLocaleString('en-US')} ft`;
  if (layer.cover === 'VV' || layer.cover === 'OVX') {
    // Vertical visibility: the sky is hidden (e.g. by fog), and this is how
    // far up an observer can see into it.
    return `Sky hidden, vertical visibility ${height}`;
  }
  let type = '';
  if (layer.type === 'CB') {
    type = ' (cumulonimbus: thunderstorm cloud)';
  } else if (layer.type === 'TCU') {
    type = ' (towering cumulus: growing shower cloud)';
  }
  return `${CLOUD_COVER_WORDS[layer.cover] ?? layer.cover} at ${height}${type}`;
}

/** All layers: "Few at 3,000 ft, Scattered at 12,000 ft" (or a "no cloud" phrase). */
export function describeClouds(clouds, cavok = false) {
  if (clouds.length === 0) {
    return cavok ? 'No cloud below 5,000 ft (CAVOK)' : 'No significant cloud';
  }
  return clouds.map(describeCloudLayer).join(', ');
}

/** The sky in everyday words, from the most-covered layer: "Partly cloudy". */
function describeSky(clouds) {
  const covers = clouds.map((layer) => layer.cover);
  if (covers.includes('VV') || covers.includes('OVX')) return 'Sky hidden';
  if (covers.includes('OVC')) return 'Overcast';
  if (covers.includes('BKN')) return 'Mostly cloudy';
  if (covers.includes('SCT')) return 'Partly cloudy';
  if (covers.includes('FEW')) return 'A few clouds';
  return 'Clear skies';
}

// ---------------------------------------------------------------------------
// Wind
// ---------------------------------------------------------------------------

// The 16 points of the compass, every 22.5°, starting at north (0°).
const COMPASS_POINTS = [
  'north', 'north-northeast', 'northeast', 'east-northeast',
  'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest',
  'west', 'west-northwest', 'northwest', 'north-northwest',
];

// Winds are named after where they come FROM: a "northerly" blows from the north.
const WIND_NAMES = [
  'northerly', 'northeasterly', 'easterly', 'southeasterly',
  'southerly', 'southwesterly', 'westerly', 'northwesterly',
];

/** 10° → "north", 225° → "southwest", 240° → "west-southwest" (nearest of 16 points). */
export function compassPoint(degrees) {
  return COMPASS_POINTS[Math.round(degrees / 22.5) % 16];
}

/**
 * How strong the wind feels, loosely following the Beaufort wind scale:
 * up to 10 kt light, 11–16 moderate, 17–21 fresh, 22–33 strong, 34+ gale.
 */
export function windStrengthWord(knots) {
  if (knots <= 10) return 'light';
  if (knots <= 16) return 'moderate';
  if (knots <= 21) return 'fresh';
  if (knots <= 33) return 'strong';
  return 'gale-force';
}

/** "light northwesterly wind, gusting 25 kt" / "calm wind" / "light variable wind". */
function describeWindForSummary(wind) {
  if (!wind) return null;
  if (wind.isCalm) return 'calm wind';
  const name = wind.isVariable ? 'variable' : WIND_NAMES[Math.round(wind.directionDeg / 45) % 8];
  const gust = wind.gustKt ? `, gusting ${wind.gustKt} kt` : '';
  return `${windStrengthWord(wind.speedKt)} ${name} wind${gust}`;
}

/** "from the north (010°) at 7 kt, gusting 20 kt" / "calm" / "variable at 3 kt". */
export function describeWindDetail(wind) {
  if (!wind) return 'not reported';
  if (wind.isCalm) return 'calm';
  const from = wind.isVariable
    ? 'variable'
    : `from the ${compassPoint(wind.directionDeg)} (${String(wind.directionDeg).padStart(3, '0')}°)`;
  const gust = wind.gustKt ? `, gusting ${wind.gustKt} kt` : '';
  return `${from} at ${wind.speedKt} kt${gust}`;
}

// ---------------------------------------------------------------------------
// Temperature and humidity
// ---------------------------------------------------------------------------

/**
 * Relative humidity (%), from the temperature and dew point, using the
 * Magnus formula. The DEW POINT is the temperature the air would have to cool
 * to before its water vapour starts condensing into droplets (dew, mist, fog).
 * The closer the dew point is to the temperature, the more humid the air.
 */
export function relativeHumidity(temperatureC, dewPointC) {
  const saturation = (t) => Math.exp((17.625 * t) / (243.04 + t));
  return (100 * saturation(dewPointC)) / saturation(temperatureC);
}

/** "very hot and humid", "mild"… */
function describeTemperatureFeel(temperatureC, dewPointC) {
  if (temperatureC === null) return null;
  let word = 'cold';
  if (temperatureC >= 40) word = 'extremely hot';
  else if (temperatureC >= 35) word = 'very hot';
  else if (temperatureC >= 30) word = 'hot';
  else if (temperatureC >= 22) word = 'warm';
  else if (temperatureC >= 15) word = 'mild';
  else if (temperatureC >= 5) word = 'cool';
  const isHumid = dewPointC !== null && temperatureC >= 25 && relativeHumidity(temperatureC, dewPointC) >= 60;
  return isHumid ? `${word} and humid` : word;
}

// ---------------------------------------------------------------------------
// Visibility and the summary sentence
// ---------------------------------------------------------------------------

function describeVisibilityForSummary(visibility) {
  if (!visibility) return null;
  if (visibility.km >= 10) return 'good visibility';
  if (visibility.km >= 5) return `moderate visibility (${visibility.km} km)`;
  if (visibility.km >= 1.5) return `poor visibility (${visibility.km} km)`;
  return `very poor visibility (${visibility.km} km)`;
}

/**
 * One plain-English sentence about the current weather, e.g.
 * "A few clouds, light northerly wind, hot and humid, good visibility."
 */
export function summarizeMetar(metar) {
  const sky = describeSky(metar.clouds);
  const weather = describeWeather(metar.weather);
  // With weather and no cloud, "Haze, clear skies" reads oddly: just say "Haze".
  let opening = sky;
  if (weather) {
    opening = sky === 'Clear skies' ? capitalize(weather) : `${capitalize(weather)}, ${sky.toLowerCase()}`;
  }
  const parts = [
    opening,
    describeWindForSummary(metar.wind),
    describeTemperatureFeel(metar.temperatureC, metar.dewPointC),
    describeVisibilityForSummary(metar.visibility),
  ];
  return `${parts.filter(Boolean).join(', ')}.`;
}
