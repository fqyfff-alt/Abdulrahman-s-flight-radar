/**
 * main.js — the starting point of the web page.
 *
 * It creates the map, asks our server for aircraft every 30 seconds and hands
 * them to aircraft.js to draw, and moves the planes forward every second in
 * between so they glide instead of jumping.
 *
 * Because index.html loads this file with type="module", it runs only after
 * the whole page has been read, so <div id="map"> already exists.
 */

import { initAircraft, moveAircraftForward, updateAircraft } from './aircraft.js';
import { fetchAircraftData, fetchMapConfig } from './api.js';
import { ANIMATION_INTERVAL_MS, REFRESH_INTERVAL_MS } from './config.js';
import { createMap } from './map.js';

// Get the map-tile key from our server first, then build the map with it.
// ("await" at the top level of a file is allowed in modules.)
const mapConfig = await fetchMapConfig();
const map = createMap(mapConfig);
initAircraft(map);

let refreshTimer = null; // the scheduled next refresh (so we can cancel it)
let isRefreshing = false; // true while a request is on its way

/** Fetch the latest aircraft and update the map. */
async function refresh() {
  if (isRefreshing) {
    return; // one request at a time
  }
  isRefreshing = true;

  try {
    const data = await fetchAircraftData();
    updateAircraft(data.aircraft);
    logUpdate(data);
  } catch (error) {
    // Keep showing the last known planes; we'll try again next time.
    console.warn(`Could not update aircraft: ${error.message}`);
  } finally {
    // "finally" runs whether the request worked or failed.
    isRefreshing = false;
    scheduleNextRefresh();
  }
}

/**
 * Wait 30 s, then refresh again. We use setTimeout after each refresh finishes
 * (instead of setInterval) so a slow request can never overlap the next one.
 */
function scheduleNextRefresh() {
  clearTimeout(refreshTimer);
  if (!document.hidden) {
    refreshTimer = setTimeout(refresh, REFRESH_INTERVAL_MS);
  }
}

/**
 * Save credits: stop refreshing while the browser tab is hidden (you switched
 * tabs or minimised the window), and refresh straight away when you come back.
 */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(refreshTimer);
  } else {
    refresh();
  }
});

/**
 * Print a line in the browser's developer console (press F12 → Console) each
 * time new data arrives. Stage 5 adds a proper status bar on the page.
 */
function logUpdate(data) {
  const time = new Date().toLocaleTimeString('en-GB');
  const source = data.fromCache ? 'from server cache' : 'fresh from OpenSky';
  console.log(`[${time}] ${data.aircraftCount} aircraft (${source}), ${data.creditsRemaining ?? '?'} credits left`);
  if (data.rateLimited) {
    console.warn(`Rate limited by OpenSky: showing the last known positions. Retrying in ${data.retryAfterSeconds} s.`);
  }
}

refresh(); // first load

// Smooth motion: move every plane a little along its track once per second.
// (setInterval is fine here: moving planes is instant, so calls can't overlap.)
setInterval(moveAircraftForward, ANIMATION_INTERVAL_MS);
