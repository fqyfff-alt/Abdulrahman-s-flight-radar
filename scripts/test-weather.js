/**
 * Weather stage 1 test script: fetch the current METAR and TAF for Muscat
 * International Airport (OOMS) ONCE and print them, field by field.
 *
 * Run it with:   npm run test-weather
 * Add --json to also print the complete responses:   npm run test-weather -- --json
 *
 * The point of this script is to see the REAL field names and value types
 * before writing any code that depends on them.
 */

import { describeWeatherError, fetchMetar, fetchTaf, WEATHER_STATION } from '../lib/weather.js';

// What each METAR field means. The ones marked "only when…" are LEFT OUT of
// the response completely (not set to null) when there's nothing to report.
const METAR_FIELD_MEANINGS = {
  icaoId: 'Airport code (ICAO)',
  name: 'Weather station name',
  metarType: 'METAR = routine report, SPECI = special report (sudden change)',
  reportTime: 'Time of the report (UTC, ISO format)',
  obsTime: 'Time of the observation (Unix seconds)',
  receiptTime: 'When the AWC received it',
  wdir: 'Wind direction in degrees, where the wind blows FROM ("VRB" = variable)',
  wspd: 'Wind speed in knots',
  wgst: 'Gust speed in knots (only when gusting)',
  visib: 'Visibility in STATUTE MILES ("6+" = 6 or more)',
  wxString: 'Present weather codes, e.g. HZ = haze (only when there is some)',
  clouds: 'Cloud layers: cover + base height in feet above the airport',
  cover: 'Summary of the most significant cloud cover',
  temp: 'Temperature in °C',
  dewp: 'Dew point in °C',
  altim: 'Pressure setting (QNH) in hPa',
  slp: 'Sea-level pressure in hPa (only some stations)',
  fltCat: 'Flight category worked out by the AWC: VFR, MVFR, IFR or LIFR',
  qcField: 'AWC internal quality-control flags',
  lat: 'Station latitude',
  lon: 'Station longitude',
  elev: 'Station elevation in metres',
  rawOb: 'The original coded METAR text',
};

/** Show a value in the table: objects/arrays as JSON, missing ones explained. */
function showValue(report, field) {
  if (!(field in report)) {
    return '(not in this report)';
  }
  const value = report[field];
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
}

/** A Unix time (seconds) as "07:50 UTC (11:50 Muscat)". Aviation uses UTC, written "Z". */
function formatTime(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  const utc = date.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
  const muscat = date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Muscat', hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
  return `${day} ${utc} UTC (${muscat} Muscat)`;
}

function printMetar(metar) {
  console.log('\n=== METAR (current weather) ===\n');
  if (!metar) {
    console.log(`No METAR available for ${WEATHER_STATION} right now.`);
    return;
  }
  console.log(`Raw:  ${metar.rawOb}`);
  console.log(`Time: ${formatTime(metar.obsTime)}\n`);

  // Every field we know about, plus any new ones the API might add later.
  const fields = [...new Set([...Object.keys(METAR_FIELD_MEANINGS), ...Object.keys(metar)])];
  const rows = fields.map((field) => ({
    Field: field,
    Value: showValue(metar, field),
    Type: field in metar ? (Array.isArray(metar[field]) ? 'array' : typeof metar[field]) : '—',
    Meaning: METAR_FIELD_MEANINGS[field] ?? '(not documented here)',
  }));
  console.table(rows);
}

/** One TAF forecast period as a table row. */
function tafRow(period) {
  const wind =
    period.wdir === null || period.wdir === undefined
      ? '—'
      : `${period.wdir}° ${period.wspd} kt${period.wgst ? ` G${period.wgst}` : ''}`;
  const clouds = (period.clouds ?? []).map((layer) => `${layer.cover} ${layer.base ?? ''}`.trim()).join(', ');
  return {
    From: formatTime(period.timeFrom),
    To: formatTime(period.timeTo),
    Change: period.fcstChange ?? '(main)',
    Wind: wind,
    'Visib (mi)': period.visib ?? '—',
    Clouds: clouds || '—',
    Weather: period.wxString ?? '—',
  };
}

function printTaf(taf) {
  console.log('\n=== TAF (forecast) ===\n');
  if (!taf) {
    console.log(`No TAF available for ${WEATHER_STATION} right now.`);
    return;
  }
  console.log(`Raw:    ${taf.rawTAF}`);
  console.log(`Issued: ${formatTime(new Date(taf.issueTime).getTime() / 1000)}`);
  console.log(`Valid:  ${formatTime(taf.validTimeFrom)}  →  ${formatTime(taf.validTimeTo)}\n`);
  console.log('Forecast periods ("fcsts"). BECMG = becoming (a gradual change), TEMPO = temporarily, FM = from:');
  console.table(taf.fcsts.map(tafRow));
}

async function main() {
  console.log(`Fetching METAR and TAF for ${WEATHER_STATION} from aviationweather.gov…`);

  // Ask for both at the same time; Promise.all waits until both have arrived.
  const [metar, taf] = await Promise.all([fetchMetar(), fetchTaf()]);

  printMetar(metar);
  printTaf(taf);

  if (process.argv.includes('--json')) {
    console.log('\n=== Complete METAR response ===');
    console.log(JSON.stringify(metar, null, 2));
    console.log('\n=== Complete TAF response ===');
    console.log(JSON.stringify(taf, null, 2));
  }
}

try {
  await main();
} catch (error) {
  console.error(`\n❌ ${describeWeatherError(error)}`);
  process.exitCode = 1;
}
