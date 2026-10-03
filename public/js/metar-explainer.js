/**
 * metar-explainer.js — breaks a raw METAR into its parts and explains each one,
 * so you can learn to read METARs yourself.
 *
 *   METAR OOMS 030750Z 01007KT 9999 FEW030 33/28 Q1015 NOSIG
 *   │     │    │       │       │    │      │     │     └ trend: no change expected
 *   │     │    │       │       │    │      │     └ pressure (QNH) 1015 hPa
 *   │     │    │       │       │    │      └ temperature 33°C / dew point 28°C
 *   │     │    │       │       │    └ few clouds at 3,000 ft
 *   │     │    │       │       └ visibility 10 km or more
 *   │     │    │       └ wind from 010° at 7 knots
 *   │     │    └ day 03 of the month, 07:50 UTC
 *   │     └ airport (ICAO code)
 *   └ report type
 *
 * explainMetar(raw) returns [{ code, meaning }], one entry per part.
 */

import { compassPoint, decodeWeatherCode, WEATHER_DESCRIPTORS, WEATHER_PHENOMENA, capitalize } from './weather-decode.js';

const COVER_MEANINGS = {
  FEW: 'Few clouds (1–2 eighths of the sky covered)',
  SCT: 'Scattered clouds (3–4 eighths of the sky covered)',
  BKN: 'Broken clouds (5–7 eighths of the sky covered)',
  OVC: 'Overcast (the whole sky covered)',
};

const DIRECTIONS = { N: 'north', NE: 'northeast', E: 'east', SE: 'southeast', S: 'south', SW: 'southwest', W: 'west', NW: 'northwest' };

// A pattern that matches any weather group, built from the code lists in
// weather-decode.js, e.g. -SHRA, +TSRA, VCTS, BLSA, RETS.
const WEATHER_GROUP = new RegExp(
  `^(RE)?(-|\\+|VC)?(${Object.keys(WEATHER_DESCRIPTORS).join('|')})?(${Object.keys(WEATHER_PHENOMENA).join('|')})*$`,
);

/** "M05" → -5 (in METARs, M means minus). */
function parseTemperature(text) {
  return text.startsWith('M') ? -Number(text.slice(1)) : Number(text);
}

/** "0750" → "07:50", plus Muscat local time (UTC+4, no daylight saving). */
function utcAndMuscat(hhmm) {
  const hours = Number(hhmm.slice(0, 2));
  const muscatHours = String((hours + 4) % 24).padStart(2, '0');
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)} UTC (${muscatHours}:${hhmm.slice(2)} in Muscat)`;
}

/** Explain one part of a METAR. `index` is its position (0 = first). */
function explainPart(part, index) {
  let match;

  if (index === 0 && (part === 'METAR' || part === 'SPECI')) {
    return part === 'METAR'
      ? 'Report type: a routine weather report, issued every 30 or 60 minutes.'
      : 'Report type: a special report, issued because the weather changed suddenly.';
  }
  if (index === 1 && /^[A-Z]{4}$/.test(part)) {
    return `The airport's ICAO code${part === 'OOMS' ? ': Muscat International Airport' : ''}.`;
  }
  if ((match = part.match(/^(\d{2})(\d{2})(\d{2})Z$/))) {
    return `Observed on day ${Number(match[1])} of the month at ${utcAndMuscat(match[2] + match[3])}. "Z" stands for Zulu, aviation's name for UTC.`;
  }
  if (part === 'AUTO') return 'Made automatically by sensors, with no human observer.';
  if (part === 'COR') return 'A corrected version of an earlier report.';
  if (part === 'NIL') return 'No report available.';

  // Wind: dddssKT or dddssGggKT (ddd = direction, ss = speed, G = gusts)
  if ((match = part.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/))) {
    const [, direction, speed, gust, unit] = match;
    // "1 knot" but "7 knots"
    const units = (value) =>
      unit === 'KT' ? `${value} ${value === 1 ? 'knot' : 'knots'}` : `${value} metres per second`;
    if (Number(speed) === 0 && direction === '000') {
      return 'Wind calm (no wind).';
    }
    const from = direction === 'VRB'
      ? 'Wind variable in direction'
      : `Wind from ${direction}° (from the ${compassPoint(Number(direction))})`;
    const gustText = gust ? `, gusting to ${units(Number(gust))}` : '';
    return `${from} at ${units(Number(speed))}${gustText}. Wind direction is always where the wind comes FROM.`;
  }
  if ((match = part.match(/^(\d{3})V(\d{3})$/))) {
    return `The wind direction is swinging between ${match[1]}° and ${match[2]}°.`;
  }

  // Visibility
  if (part === 'CAVOK') {
    return 'CAVOK = "Ceiling And Visibility OK": visibility 10 km or more, no cloud below 5,000 ft, no thunderstorm clouds, no significant weather.';
  }
  if (part === '9999') return 'Visibility 10 km or more (9999 is the highest value that can be reported).';
  if (part === '0000') return 'Visibility less than 50 metres.';
  if ((match = part.match(/^(\d{4})(NDV)?$/))) {
    const metres = Number(match[1]);
    return `Visibility ${metres.toLocaleString('en-US')} metres (${metres / 1000} km).`;
  }
  if ((match = part.match(/^(\d{4})(N|NE|E|SE|S|SW|W|NW)$/))) {
    return `The lowest visibility is ${Number(match[1]).toLocaleString('en-US')} metres, towards the ${DIRECTIONS[match[2]]}.`;
  }
  if ((match = part.match(/^(P|M)?(\d+(?:\/\d+)?)SM$/))) {
    return `Visibility ${match[1] === 'P' ? 'more than ' : match[1] === 'M' ? 'less than ' : ''}${match[2]} statute miles (US units).`;
  }
  if ((match = part.match(/^R(\d{2}[LCR]?)\/([PM])?(\d{4})/))) {
    return `Runway visual range: along runway ${match[1]}, a pilot can see ${match[2] === 'P' ? 'more than ' : match[2] === 'M' ? 'less than ' : ''}${Number(match[3])} metres.`;
  }

  // Weather (haze, dust, rain, …)
  if (WEATHER_GROUP.test(part) && part.length >= 2) {
    const words = decodeWeatherCode(part);
    if (words !== part) {
      return `Weather: ${words}.`;
    }
  }

  // Clouds: FEW030 = few clouds at 030 hundred feet = 3,000 ft
  if ((match = part.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/))) {
    const [, cover, hundreds, type] = match;
    let typeText = '';
    if (type === 'CB') typeText = ' These are cumulonimbus: thunderstorm clouds.';
    if (type === 'TCU') typeText = ' These are towering cumulus: tall, growing shower clouds.';
    return `${COVER_MEANINGS[cover]} with their base at ${(Number(hundreds) * 100).toLocaleString('en-US')} ft above the airport.${typeText}`;
  }
  if ((match = part.match(/^VV(\d{3}|\/\/\/)$/))) {
    return match[1] === '///'
      ? 'Sky hidden (e.g. by fog); vertical visibility not measured.'
      : `Sky hidden (e.g. by fog); an observer can see ${Number(match[1]) * 100} ft straight up.`;
  }
  if (part === 'NSC') return 'No significant cloud (nothing below 5,000 ft, no thunderstorm clouds).';
  if (part === 'NCD') return 'No cloud detected by the automatic sensors.';
  if (part === 'SKC' || part === 'CLR') return 'Sky clear.';
  if (part === 'NSW') return 'No significant weather.';

  // Temperature / dew point: 33/28, M02/M05
  if ((match = part.match(/^(M?\d{2})\/(M?\d{2})?$/))) {
    const temperature = parseTemperature(match[1]);
    const dewPoint = match[2] ? parseTemperature(match[2]) : null;
    return `Temperature ${temperature}°C${dewPoint === null ? '' : `, dew point ${dewPoint}°C`}. The dew point is how cool the air must get for its moisture to condense into mist or fog.`;
  }

  // Pressure: Q1015 (hectopascals) or A3015 (inches of mercury, in the US)
  if ((match = part.match(/^Q(\d{4})$/))) {
    return `Pressure setting (QNH) ${Number(match[1])} hPa. Pilots set this on their altimeter so it shows their height above sea level. Standard pressure is 1013 hPa.`;
  }
  if ((match = part.match(/^A(\d{4})$/))) {
    return `Pressure setting ${match[1].slice(0, 2)}.${match[1].slice(2)} inches of mercury (the unit used in the US).`;
  }

  // Trend: the expected change over the next 2 hours
  if (part === 'NOSIG') return 'No significant change expected in the next 2 hours.';
  if (part === 'TEMPO') return 'Trend: the parts that follow describe TEMPORARY changes expected in the next 2 hours.';
  if (part === 'BECMG') return 'Trend: the parts that follow describe a lasting change ("becoming") expected in the next 2 hours.';
  if ((match = part.match(/^(FM|TL|AT)(\d{4})$/))) {
    const word = { FM: 'From', TL: 'Until', AT: 'At' }[match[1]];
    return `${word} ${utcAndMuscat(match[2])}.`;
  }
  if (/^R\d{2}[LCR]?\/.+$/.test(part)) return 'Runway condition report (e.g. whether the runway is clear and dry).';
  if (part === 'WS') return 'Wind shear: a sudden change in wind speed or direction, dangerous near the ground.';

  return 'Not decoded by this app.';
}

/**
 * Explain every part of a raw METAR: [{ code, meaning }].
 * Everything after "RMK" (remarks) is kept together as one entry.
 */
export function explainMetar(raw) {
  const parts = raw.trim().split(/\s+/);
  const explanations = [];
  for (let index = 0; index < parts.length; index++) {
    if (parts[index] === 'RMK') {
      explanations.push({
        code: parts.slice(index).join(' '),
        meaning: 'Remarks: extra notes, mostly for local use (often in a national code).',
      });
      break;
    }
    explanations.push({ code: parts[index], meaning: capitalize(explainPart(parts[index], index)) });
  }
  return explanations;
}
