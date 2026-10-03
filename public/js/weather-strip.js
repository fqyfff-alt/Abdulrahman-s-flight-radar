/**
 * weather-strip.js — the compact weather readout in the status bar:
 *
 *   [VFR] 010° 7kt  33°C  10+ km  updated 12 min ago
 *
 * The strip's `data-state` attribute drives its look (see style.css):
 *   loading     → "Fetching weather…"
 *   ready       → the weather
 *   unavailable → "Weather unavailable"
 */

import { WEATHER_OLD_AFTER_MINUTES } from './config.js';
import { escapeHtml } from './format.js';
import {
  describeWindInWords,
  FLIGHT_CATEGORIES,
  formatAge,
  formatTemperature,
  formatVisibility,
  formatWind,
  minutesSince,
} from './weather-format.js';

const strip = document.getElementById('weather-strip');

// Remembered so the "X min ago" text can tick along between refreshes.
let observedAt = null;
let isStale = false;

/** Show the latest weather from /api/weather. */
export function showWeather(data) {
  const metar = data.metar;
  if (!metar) {
    showWeatherUnavailable(data.error ?? 'No weather report available right now.');
    return;
  }

  observedAt = metar.observedAt;
  isStale = data.stale === true;

  // Unknown categories get a neutral grey badge (see style.css).
  const category = FLIGHT_CATEGORIES[metar.flightCategory] ? metar.flightCategory : 'unknown';

  strip.dataset.state = 'ready';
  strip.innerHTML = `
    <span class="flight-category" data-category="${category}">${escapeHtml(metar.flightCategory ?? '—')}</span>
    <span class="wx-wind">${escapeHtml(formatWind(metar.wind))}</span>
    <span class="wx-temp">${formatTemperature(metar.temperatureC)}</span>
    <span class="wx-vis">${formatVisibility(metar.visibility)}</span>
    <span class="wx-age"></span>`;

  // The visible strip is very short, so give screen readers a full sentence.
  strip.setAttribute(
    'aria-label',
    `Weather at Muscat airport: ${FLIGHT_CATEGORIES[category]?.name ?? 'flight category unknown'}, ` +
      `wind ${describeWindInWords(metar.wind)}, temperature ${formatTemperature(metar.temperatureC)}, ` +
      `visibility ${formatVisibility(metar.visibility)}.`,
  );
  if (FLIGHT_CATEGORIES[category]) {
    strip.title = `${category}: ${FLIGHT_CATEGORIES[category].meaning}`; // hover tooltip
  }

  updateAge();
}

/** No weather to show (the weather service is down and nothing is cached). */
export function showWeatherUnavailable(reason) {
  observedAt = null;
  strip.dataset.state = 'unavailable';
  strip.textContent = 'Weather unavailable';
  strip.title = reason;
  strip.setAttribute('aria-label', `Weather unavailable: ${reason}`);
}

/**
 * Update the "updated X min ago" text. It turns amber when the report is
 * over 90 minutes old, or when the weather service couldn't be reached
 * (the server then sends the last report it had, marked stale).
 */
function updateAge() {
  const ageElement = strip.querySelector('.wx-age');
  if (!ageElement || observedAt === null) {
    return;
  }
  const minutes = minutesSince(observedAt);
  const isOld = minutes > WEATHER_OLD_AFTER_MINUTES;
  ageElement.textContent = `updated ${formatAge(minutes)}`;
  ageElement.classList.toggle('is-old', isOld || isStale);
  if (isStale) {
    ageElement.title = "Couldn't reach the weather service, so this is the last report we had.";
  } else if (isOld) {
    ageElement.title = 'This report is over 90 minutes old; a newer one may not have arrived yet.';
  } else {
    ageElement.removeAttribute('title');
  }
}

// Tick the age text along every 30 seconds (no new download needed).
setInterval(updateAge, 30_000);
