/**
 * status.js — the thin status bar along the top of the screen, and the
 * "Scanning airspace…" message shown until the first data arrives.
 *
 * The bar's `data-state` attribute drives its look (see style.css):
 *   loading → grey dot      live  → pulsing green dot
 *   limited → amber dot     error → red dot
 */

import { formatAge, formatClockTime } from './format.js';

const statusBar = document.getElementById('status-bar');
const messageElement = document.getElementById('status-message');
const aircraftElement = document.getElementById('stat-aircraft');
const updatedElement = document.getElementById('stat-updated');
const creditsElement = document.getElementById('stat-credits');
const scanningElement = document.getElementById('scanning');

/** Show a short message next to the title ('' to clear it). */
function setMessage(text) {
  messageElement.textContent = text;
  statusBar.classList.toggle('has-message', text !== ''); // lets phones hide the title to make room
}

/** Show the latest data from /api/aircraft. */
export function showStatus(data) {
  statusBar.dataset.state = data.rateLimited ? 'limited' : 'live';

  aircraftElement.textContent = data.aircraftCount;

  // The time OpenSky says the positions are from, in your local time.
  // Hover over it to see the UTC time that aviation uses.
  if (data.timestamp) {
    updatedElement.textContent = formatClockTime(data.timestamp);
    const utc = new Date(data.timestamp * 1000).toLocaleTimeString('en-GB', { timeZone: 'UTC' });
    updatedElement.title = `${utc} UTC`;
  } else {
    updatedElement.textContent = '—';
  }

  creditsElement.textContent =
    data.creditsRemaining === null ? '—' : data.creditsRemaining.toLocaleString('en-US');

  setMessage(data.rateLimited ? `Rate limited · retry in ${formatAge(data.retryAfterSeconds)}` : '');
  scanningElement.hidden = true; // data has arrived
}

/** Our server couldn't be reached (or OpenSky failed). The map keeps the last data. */
export function showConnectionProblem(errorMessage) {
  statusBar.dataset.state = 'error';
  setMessage('Connection lost · retrying');
  messageElement.title = errorMessage; // hover to see the details
}
