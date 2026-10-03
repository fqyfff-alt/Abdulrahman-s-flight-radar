/**
 * main.js — the starting point of the web page.
 *
 * It creates the map and the other parts of the page, plays the opening
 * animation, asks our server for aircraft every 30 seconds and passes the data
 * to each part (map, side panel, airport label, status bar), and moves the
 * planes forward every second in between so they glide instead of jumping.
 *
 * Because index.html loads this file with type="module", it runs only after
 * the whole page has been read, so <div id="map"> already exists.
 */

import { focusAircraft, initAircraft, moveAircraftForward, updateAircraft } from './aircraft.js';
import { initAirport, updateAirport } from './airport.js';
import { summariseAirspace } from './airspace.js';
import { fetchAircraftData, fetchMapConfig } from './api.js';
import { loadBorders } from './borders.js';
import { ANIMATION_INTERVAL_MS, REFRESH_INTERVAL_MS } from './config.js';
import { refreshPopupPadding } from './layout.js';
import { playIntro } from './intro.js';
import { createMap } from './map.js';
import { highlightSelectedRow, initPanel, updatePanel } from './panel.js';
import { showConnectionProblem, showStatus } from './status.js';

// Start downloading the country borders for the opening animation right away,
// so the download happens while everything else is being set up.
const bordersPromise = loadBorders();

// Get the map-tile key from our server first, then build the map with it.
// ("await" at the top level of a file is allowed in modules.)
const mapConfig = await fetchMapConfig();
const map = createMap(mapConfig);
initAirport(map);

// Connect the map and the side panel: selecting a plane in one highlights it
// in the other.
initAircraft(map, { onSelectionChange: highlightSelectedRow });
initPanel({ onSelect: focusAircraft });
refreshPopupPadding();

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

    const summary = summariseAirspace(data.aircraft); // arrivals + nearby count
    updatePanel(data.aircraft, summary);
    updateAirport(summary);
    showStatus(data);
    logUpdate(data);
  } catch (error) {
    // Keep showing the last known planes; we'll try again next time.
    showConnectionProblem(error.message);
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
 * Also print a line in the browser's developer console (F12 → Console) each
 * time new data arrives. Handy for checking what's going on.
 */
function logUpdate(data) {
  const time = new Date().toLocaleTimeString('en-GB');
  const source = data.fromCache ? 'from server cache' : 'fresh from OpenSky';
  console.log(`[${time}] ${data.aircraftCount} aircraft (${source}), ${data.creditsRemaining ?? '?'} credits left`);
  if (data.rateLimited) {
    console.warn(`Rate limited by OpenSky: showing the last known positions. Retrying in ${data.retryAfterSeconds} s.`);
  }
}

refresh(); // first load: runs in the background while the opening animation plays

// Smooth motion: move every plane a little along its track once per second.
// (setInterval is fine here: moving planes is instant, so calls can't overlap.)
setInterval(moveAircraftForward, ANIMATION_INTERVAL_MS);

// The opening animation: borders draw in, then everything fades in.
playIntro(map, bordersPromise);
