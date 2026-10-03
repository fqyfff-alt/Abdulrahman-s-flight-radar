/**
 * weather-panel.js — the full weather panel that opens when you click the
 * weather strip in the status bar. On a laptop it drops down on the right;
 * on a phone it slides up from the bottom as a sheet.
 *
 * It shows: a plain-English summary, wind (with a compass), temperature and
 * dew point, visibility, pressure, clouds, weather, the forecast (TAF), and
 * the raw METAR with a "What does this mean?" explainer.
 */

import { escapeHtml } from './format.js';
import { refreshPopupPadding } from './layout.js';
import { explainMetar } from './metar-explainer.js';
import { summarizeTaf } from './taf-summary.js';
import {
  capitalize,
  compassPoint,
  describeClouds,
  describeWeather,
  relativeHumidity,
  summarizeMetar,
  windStrengthWord,
} from './weather-decode.js';
import { FLIGHT_CATEGORIES, formatAge, formatTemperature, formatVisibility, minutesSince } from './weather-format.js';

const panel = document.getElementById('weather-panel');
const panelBody = document.getElementById('weather-panel-body');
const panelTitle = document.getElementById('weather-panel-title');
const closeButton = document.getElementById('weather-panel-close');
const strip = document.getElementById('weather-strip');

// A dew-point spread this small (°C) or smaller means mist or fog is likely.
const SMALL_SPREAD_C = 3;

let latestData = null; // the last answer from /api/weather

// ---------------------------------------------------------------------------
// Opening and closing
// ---------------------------------------------------------------------------

function isOpen() {
  return panel.classList.contains('is-open');
}

function openWeatherPanel() {
  render();
  panel.classList.add('is-open');
  strip.setAttribute('aria-expanded', 'true');
  // Move keyboard focus into the panel. We wait for the next frame because the
  // browser must first apply the "open" styles: until then the panel still
  // counts as hidden, and hidden elements can't receive focus. (With "reduce
  // motion" switched on, focusing straight away silently failed.)
  requestAnimationFrame(() => panelTitle.focus({ preventScroll: true }));
  refreshPopupPadding(); // the panel now covers part of the map
}

function closeWeatherPanel() {
  const focusWasInside = panel.contains(document.activeElement);
  panel.classList.remove('is-open');
  strip.setAttribute('aria-expanded', 'false');
  if (focusWasInside) {
    strip.focus(); // put keyboard users back where they started
  }
  refreshPopupPadding();
}

/** Call once at startup. */
export function initWeatherPanel() {
  strip.addEventListener('click', () => (isOpen() ? closeWeatherPanel() : openWeatherPanel()));
  closeButton.addEventListener('click', closeWeatherPanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      closeWeatherPanel();
    }
  });
  // Keep the "41 min ago" text current while the panel is open.
  setInterval(updateObservedAge, 30_000);
}

/** New data from /api/weather: remember it, and redraw if the panel is open. */
export function updateWeatherPanel(data) {
  latestData = data;
  if (isOpen()) {
    render();
  }
}

// ---------------------------------------------------------------------------
// The wind compass
// ---------------------------------------------------------------------------

/** A point on a circle around the compass centre (36, 36), `angle` clockwise from north. */
function pointOnCircle(angleDegrees, radius) {
  const angle = (angleDegrees * Math.PI) / 180;
  // x grows to the right (east) with sin; y grows DOWN in SVG, so north is −cos.
  return [36 + radius * Math.sin(angle), 36 - radius * Math.cos(angle)];
}

/**
 * A small compass. The arrow points to where the wind is coming FROM: it is
 * drawn pointing north (up), then rotated by the wind direction. If the
 * direction is swinging (e.g. 200V270), that range is shaded.
 */
function compassSvg(wind) {
  const radius = 30;
  let sector = '';
  if (wind?.variableFromDeg !== null && wind?.variableFromDeg !== undefined) {
    const from = wind.variableFromDeg;
    const to = wind.variableToDeg;
    const span = (to - from + 360) % 360; // degrees, going clockwise
    const [x1, y1] = pointOnCircle(from, radius);
    const [x2, y2] = pointOnCircle(to, radius);
    // SVG arc: A rx ry rotation large-arc-flag sweep-flag x y (sweep 1 = clockwise)
    sector = `<path class="compass-sector" d="M36 36 L${x1} ${y1} A${radius} ${radius} 0 ${span > 180 ? 1 : 0} 1 ${x2} ${y2} Z" />`;
  }

  let middle;
  let label;
  if (!wind) {
    middle = '<text class="compass-centre" x="36" y="36">—</text>';
    label = 'Wind not reported';
  } else if (wind.isCalm) {
    middle = '<text class="compass-centre" x="36" y="36">CALM</text>';
    label = 'Wind calm';
  } else if (wind.isVariable) {
    middle = '<text class="compass-centre" x="36" y="36">VRB</text>';
    label = 'Wind variable in direction';
  } else {
    middle = `
      <g class="compass-arrow" transform="rotate(${wind.directionDeg} 36 36)">
        <line x1="36" y1="40" x2="36" y2="27" />
        <path d="M36 20 L31.5 28 L40.5 28 Z" />
      </g>
      <circle class="compass-hub" cx="36" cy="36" r="2.5" />`;
    label = `Wind from ${wind.directionDeg} degrees`;
  }

  return `
    <svg class="wind-compass" viewBox="0 0 72 72" role="img" aria-label="${label}">
      <circle class="compass-ring" cx="36" cy="36" r="${radius}" />
      ${sector}
      <text x="36" y="12">N</text><text x="61" y="37">E</text>
      <text x="36" y="62">S</text><text x="11" y="37">W</text>
      ${middle}
    </svg>`;
}

// ---------------------------------------------------------------------------
// Building the panel
// ---------------------------------------------------------------------------

/** "07:50 UTC (11:50 Muscat)" */
function formatObservedTime(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  const options = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  const utc = date.toLocaleTimeString('en-GB', { ...options, timeZone: 'UTC' });
  const muscat = date.toLocaleTimeString('en-GB', { ...options, timeZone: 'Asia/Muscat' });
  return `${utc} UTC (${muscat} Muscat)`;
}

function headlineSection(data) {
  const { metar } = data;
  const category = FLIGHT_CATEGORIES[metar.flightCategory];
  const staleNote = data.stale
    ? `<p class="wx-note wx-note-warning">Couldn't reach the weather service, so this is the last report we had.</p>`
    : '';
  return `
    <section class="wx-section">
      <div class="wx-category-row">
        <span class="flight-category" data-category="${category ? metar.flightCategory : 'unknown'}">${escapeHtml(metar.flightCategory ?? '—')}</span>
        <span class="wx-category-name">${category ? category.name : 'Flight category unknown'}</span>
      </div>
      ${category ? `<p class="wx-category-meaning">${category.meaning}</p>` : ''}
      <p class="wx-summary">${escapeHtml(summarizeMetar(metar))}</p>
      <p class="wx-observed">${metar.type} observed ${formatObservedTime(metar.observedAt)} · <span class="wx-observed-age"></span></p>
      ${staleNote}
    </section>`;
}

function windSection({ wind }) {
  let main = 'Not reported';
  const details = [];
  if (wind?.isCalm) {
    main = 'Calm';
    details.push('No wind (0 knots)');
  } else if (wind) {
    const direction = wind.isVariable ? 'Variable' : `${String(wind.directionDeg).padStart(3, '0')}°`;
    main = `${direction} · ${wind.speedKt} kt`;
    details.push(
      wind.isVariable
        ? `${capitalize(windStrengthWord(wind.speedKt))}, no steady direction`
        : `From the ${compassPoint(wind.directionDeg)} · ${windStrengthWord(wind.speedKt)}`,
    );
    details.push(wind.gustKt ? `Gusting to ${wind.gustKt} kt` : 'No gusts');
    if (wind.variableFromDeg !== null) {
      details.push(`Swinging between ${String(wind.variableFromDeg).padStart(3, '0')}° and ${String(wind.variableToDeg).padStart(3, '0')}°`);
    }
  }
  return `
    <section class="wx-section">
      <h3 class="wx-heading">Wind</h3>
      <div class="wx-wind-row">
        ${compassSvg(wind)}
        <div>
          <div class="wx-big">${main}</div>
          ${details.map((line) => `<div class="wx-sub">${line}</div>`).join('')}
        </div>
      </div>
      <p class="wx-hint">The arrow points to where the wind is coming FROM. 1 knot = 1.85 km/h.</p>
    </section>`;
}

function temperatureSection({ temperatureC, dewPointC }) {
  if (temperatureC === null) {
    return '';
  }
  const hasDewPoint = dewPointC !== null;
  const spread = hasDewPoint ? temperatureC - dewPointC : null;
  const isSmallSpread = hasDewPoint && spread <= SMALL_SPREAD_C;
  return `
    <section class="wx-section">
      <h3 class="wx-heading">Temperature and dew point</h3>
      <dl class="wx-grid">
        <dt>Temperature</dt><dd>${formatTemperature(temperatureC)}</dd>
        <dt>Dew point</dt><dd>${hasDewPoint ? formatTemperature(dewPointC) : '—'}</dd>
        ${hasDewPoint ? `<dt>Spread</dt><dd>${Math.round(spread)}°C</dd>` : ''}
        ${hasDewPoint ? `<dt>Humidity</dt><dd>≈${Math.round(relativeHumidity(temperatureC, dewPointC))}%</dd>` : ''}
      </dl>
      ${hasDewPoint ? `<p class="wx-note${isSmallSpread ? ' wx-note-warning' : ''}">
        The <strong>spread</strong> is the gap between the temperature and the dew point.
        ${isSmallSpread ? `It's small right now (${Math.round(spread)}°C), so` : 'When it is small (3°C or less),'}
        the air is nearly full of water vapour and mist or fog can form, especially as the air cools at night.
      </p>` : ''}
    </section>`;
}

function conditionsSection(metar) {
  const weather = describeWeather(metar.weather);
  return `
    <section class="wx-section">
      <h3 class="wx-heading">Visibility, pressure and sky</h3>
      <dl class="wx-grid">
        <dt>Visibility</dt><dd>${formatVisibility(metar.visibility)}</dd>
        <dt>Pressure (QNH)</dt><dd>${metar.pressureHpa === null ? '—' : `${metar.pressureHpa} hPa`}</dd>
        <dt>Clouds</dt><dd>${escapeHtml(describeClouds(metar.clouds, metar.cavok))}</dd>
        <dt>Weather</dt><dd>${weather ? escapeHtml(capitalize(weather)) : 'None reported'}</dd>
      </dl>
      <p class="wx-hint">QNH is the pressure setting that makes an altimeter read height above sea level. Standard pressure is 1013 hPa. Cloud heights are above the airport.</p>
    </section>`;
}

function forecastSection(taf) {
  if (!taf) {
    return `
      <section class="wx-section">
        <h3 class="wx-heading">Forecast (TAF)</h3>
        <p class="wx-note">No forecast available right now.</p>
      </section>`;
  }
  const lines = summarizeTaf(taf);
  const items = lines.length > 0
    ? lines.map((line) => `<li><span class="wx-forecast-when">${escapeHtml(line.when)}</span><span>${escapeHtml(line.text)}</span></li>`).join('')
    : '<li>No forecast periods for the next 12 hours.</li>';
  return `
    <section class="wx-section">
      <h3 class="wx-heading">Forecast (TAF) · next 12 hours</h3>
      <ul class="wx-forecast">${items}</ul>
      <p class="wx-hint">Times are Muscat time (UTC+4). Issued ${formatObservedTime(taf.issuedAt)}.</p>
      <details data-name="raw-taf">
        <summary>Raw TAF</summary>
        <pre class="wx-raw">${escapeHtml(taf.raw)}</pre>
      </details>
    </section>`;
}

function rawMetarSection(metar) {
  const rows = explainMetar(metar.raw)
    .map((part) => `<dt><code>${escapeHtml(part.code)}</code></dt><dd>${escapeHtml(part.meaning)}</dd>`)
    .join('');
  // <details> is a built-in HTML toggle: click the <summary> to open or close
  // it. It works with the keyboard and screen readers without any JavaScript.
  return `
    <section class="wx-section">
      <h3 class="wx-heading">Raw METAR</h3>
      <pre class="wx-raw">${escapeHtml(metar.raw)}</pre>
      <details data-name="explainer">
        <summary>What does this mean?</summary>
        <dl class="metar-explainer">${rows}</dl>
      </details>
    </section>`;
}

function buildPanelHtml(data) {
  if (!data) {
    return '<p class="wx-note">Fetching weather…</p>';
  }
  if (!data.metar) {
    return `<p class="wx-note wx-note-warning">Weather unavailable. ${escapeHtml(data.error ?? '')}</p>`;
  }
  return [
    headlineSection(data),
    windSection(data.metar),
    temperatureSection(data.metar),
    conditionsSection(data.metar),
    forecastSection(data.taf),
    rawMetarSection(data.metar),
  ].join('');
}

/** Redraw the panel, keeping any opened toggles open. */
function render() {
  const openToggles = [...panelBody.querySelectorAll('details[open]')].map((details) => details.dataset.name);
  panelBody.innerHTML = buildPanelHtml(latestData);
  for (const name of openToggles) {
    panelBody.querySelector(`details[data-name="${name}"]`)?.setAttribute('open', '');
  }
  updateObservedAge();
}

/** "41 min ago" next to the observation time. */
function updateObservedAge() {
  const ageElement = panelBody.querySelector('.wx-observed-age');
  if (ageElement && latestData?.metar) {
    ageElement.textContent = formatAge(minutesSince(latestData.metar.observedAt));
  }
}
