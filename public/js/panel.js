/**
 * panel.js — the side panel listing every aircraft.
 *
 * On a laptop it sits on the left. On a phone it becomes a "bottom sheet":
 * a strip at the bottom of the screen that you tap or swipe up to open.
 *
 * Contents (top to bottom):
 *   - a header: aircraft count + summary (also the open/close button)
 *   - "Likely arrivals" (only when there are some), soonest first
 *   - "All aircraft", highest first
 * Clicking a row flies the map to that plane and opens its popup.
 */

import { ARRIVAL_MAX_ALTITUDE_FEET, ARRIVAL_MAX_DISTANCE_KM, AIRPORT, NEARBY_RADIUS_KM } from './config.js';
import {
  displayName,
  escapeHtml,
  formatAltitude,
  formatDistanceKm,
  formatMinutes,
  formatSpeed,
  getAltitudeBand,
} from './format.js';
import { isPositionStale } from './geo.js';
import { isPhoneLayout, refreshPopupPadding } from './layout.js';

// A swipe must move at least this many pixels up or down; less counts as a tap.
const SWIPE_THRESHOLD_PX = 30;

// The page elements we update (defined in index.html).
const panel = document.getElementById('side-panel');
const toggleButton = document.getElementById('panel-toggle');
const countElement = document.getElementById('panel-count');
const summaryElement = document.getElementById('panel-summary');
const arrivalsSection = document.getElementById('arrivals-section');
const arrivalsNote = document.getElementById('arrivals-note');
const arrivalsList = document.getElementById('arrivals-list');
const allList = document.getElementById('aircraft-list');
const emptyMessage = document.getElementById('panel-empty');

let selectedIcao = null; // the plane whose popup is open
let onSelectAircraft = () => {}; // replaced by initPanel()
let swipeJustHappened = false;

/**
 * Call once at startup. `onSelect(icao24)` is called when a row is clicked.
 */
export function initPanel({ onSelect }) {
  onSelectAircraft = onSelect;

  // Explain the arrivals rule using the real settings, so it can never be out of date.
  arrivalsNote.textContent =
    `A rough guess: within ${ARRIVAL_MAX_DISTANCE_KM} km of ${AIRPORT.icao}, below ` +
    `${ARRIVAL_MAX_ALTITUDE_FEET.toLocaleString('en-US')} ft and descending. ` +
    'Times assume a straight line at the current speed, so real ones are usually longer.';

  // Open on laptops, closed on phones (so the map isn't covered).
  setExpanded(!isPhoneLayout());

  toggleButton.addEventListener('click', handleToggleClick);
  setUpSwipe();

  // ONE click listener on the whole panel handles every row, including rows
  // created later. The click "bubbles up" from the row to the panel, and
  // closest() finds which row it came from. This is called event delegation.
  panel.addEventListener('click', (event) => {
    const row = event.target.closest('.aircraft-row');
    if (row) {
      selectFromList(row.dataset.icao);
    }
  });
}

// ---------------------------------------------------------------------------
// Opening and closing (tap or swipe)
// ---------------------------------------------------------------------------

function setExpanded(expanded) {
  panel.classList.toggle('is-expanded', expanded);
  // aria-expanded tells screen readers whether the panel is open.
  toggleButton.setAttribute('aria-expanded', String(expanded));
  refreshPopupPadding(); // the covered part of the map just changed
}

function handleToggleClick() {
  // A swipe can also produce a click; it has already been handled.
  if (swipeJustHappened) {
    swipeJustHappened = false;
    return;
  }
  setExpanded(!panel.classList.contains('is-expanded'));
}

/**
 * Swipe up to open, down to close. We remember where the finger went down,
 * and when it lifts, check how far it moved. "Pointer events" work for touch,
 * mouse and pen alike.
 */
function setUpSwipe() {
  let startY = null;

  toggleButton.addEventListener('pointerdown', (event) => {
    startY = event.clientY;
    swipeJustHappened = false;
    // Keep receiving this pointer's events even if the finger slides off the button.
    toggleButton.setPointerCapture(event.pointerId);
  });

  toggleButton.addEventListener('pointerup', (event) => {
    if (startY === null) {
      return;
    }
    const distanceMoved = event.clientY - startY; // negative = moved up
    startY = null;
    if (Math.abs(distanceMoved) < SWIPE_THRESHOLD_PX) {
      return; // just a tap: the click handler takes care of it
    }
    swipeJustHappened = true;
    setExpanded(distanceMoved < 0);
  });
}

/** A row was clicked: on phones, close the sheet first so the plane is visible. */
function selectFromList(icao24) {
  if (isPhoneLayout()) {
    setExpanded(false);
  }
  onSelectAircraft(icao24);
}

// ---------------------------------------------------------------------------
// The lists
// ---------------------------------------------------------------------------

/** Sorting key: highest first, then unknown altitude, then planes on the ground. */
function altitudeSortKey(plane) {
  if (plane.onGround) {
    return -2;
  }
  return plane.baroAltitude ?? plane.geoAltitude ?? -1;
}

/** "3 within 30 km of OOMS · 2 likely arrivals" */
function buildSummaryText({ nearbyCount, arrivals }) {
  const arrivalWord = arrivals.length === 1 ? 'likely arrival' : 'likely arrivals';
  return `${nearbyCount} within ${NEARBY_RADIUS_KM} km of ${AIRPORT.icao} · ${arrivals.length} ${arrivalWord}`;
}

/** Build one list row (a <button> inside an <li>) for a plane. */
function buildRow(plane, arrivalEstimate) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `aircraft-row alt-${getAltitudeBand(plane)}`; // the dot's colour
  row.classList.toggle('is-stale', isPositionStale(plane));
  row.classList.toggle('is-selected', plane.icao24 === selectedIcao);
  row.dataset.icao = plane.icao24; // read back by the click listener

  // Arrival rows also show the rough time and distance to the airport.
  const etaHtml = arrivalEstimate
    ? `<span class="row-eta">
         <span class="row-eta-time">${formatMinutes(arrivalEstimate.minutes)}</span>
         <span class="row-eta-distance">${formatDistanceKm(arrivalEstimate.distanceKm)}</span>
       </span>`
    : '';

  row.innerHTML = `
    <span class="row-dot" aria-hidden="true"></span>
    <span class="row-text">
      <span class="row-callsign">${escapeHtml(displayName(plane))}</span>
      <span class="row-details">${formatAltitude(plane)} · ${formatSpeed(plane.velocity)}</span>
    </span>
    ${etaHtml}`;

  const item = document.createElement('li');
  item.append(row);
  return item;
}

/**
 * Rebuild both lists from the latest data. Called after every refresh.
 * `summary` comes from summariseAirspace() in airspace.js.
 */
export function updatePanel(planes, summary) {
  // If a keyboard user is on a row, remember it so we can put them back
  // there after the rows are rebuilt.
  const focusedRow = document.activeElement?.closest?.('.aircraft-row');
  const focusedList = focusedRow?.closest('.aircraft-list');

  countElement.textContent = planes.length;
  summaryElement.textContent = buildSummaryText(summary);

  arrivalsSection.hidden = summary.arrivals.length === 0;
  arrivalsList.replaceChildren(
    ...summary.arrivals.map(({ plane, estimate }) => buildRow(plane, estimate)),
  );

  const sortedPlanes = [...planes].sort((a, b) => altitudeSortKey(b) - altitudeSortKey(a));
  allList.replaceChildren(...sortedPlanes.map((plane) => buildRow(plane, null)));
  emptyMessage.hidden = planes.length > 0;

  if (focusedRow && focusedList) {
    // CSS.escape makes any text safe to use inside a CSS selector.
    focusedList.querySelector(`[data-icao="${CSS.escape(focusedRow.dataset.icao)}"]`)?.focus();
  }
}

/**
 * Highlight the row(s) of the selected plane (teal left border), or none if
 * icao24 is null. Called when a popup opens or closes on the map.
 */
export function highlightSelectedRow(icao24) {
  selectedIcao = icao24;
  for (const row of panel.querySelectorAll('.aircraft-row')) {
    row.classList.toggle('is-selected', row.dataset.icao === icao24);
  }
  // On a laptop, scroll the list so the selected plane is visible.
  if (icao24 && !isPhoneLayout()) {
    allList.querySelector(`[data-icao="${CSS.escape(icao24)}"]`)?.scrollIntoView({ block: 'nearest' });
  }
}
