/**
 * aircraft.js — draws the aircraft on the map.
 *
 * Each aircraft gets one Leaflet marker: a plane icon rotated to its direction
 * of travel, a callsign label, and a popup with flight details. When new data
 * arrives we UPDATE existing markers instead of deleting and re-creating them,
 * which avoids flicker and keeps an open popup open.
 */

import {
  describeVerticalRate,
  escapeHtml,
  formatAltitude,
  formatHeading,
  formatSpeed,
} from './format.js';

// ---------------------------------------------------------------------------
// The plane icon
// ---------------------------------------------------------------------------

// Icon size on screen, in pixels.
const ICON_SIZE = 22;

/**
 * A top-down airliner silhouette drawn in a 24×24 box, pointing UP (north).
 * Because it points north at 0°, we can rotate it by the aircraft's track in
 * degrees and it points the right way: CSS rotate() turns clockwise, exactly
 * like compass bearings (90° = east, 180° = south, 270° = west).
 *
 * Reading the path: M = move to, L = line to, C = curve to, Z = close the shape.
 * It traces the nose, right wing, right tailplane, left tailplane, left wing.
 */
const PLANE_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 1.5 C12.8 1.5 13.3 2.4 13.3 3.5 L13.3 8.6 L21.5 13.2 L21.5 15 L13.3 12.6
             L13.1 18.2 L16 20.2 L16 21.6 L12 20.6 L8 21.6 L8 20.2 L10.9 18.2 L10.7 12.6
             L2.5 15 L2.5 13.2 L10.7 8.6 L10.7 3.5 C10.7 2.4 11.2 1.5 12 1.5 Z" />
  </svg>`;

/**
 * A Leaflet "divIcon" is a marker made of our own HTML (instead of an image).
 * Its parts:
 *   .plane-ring  – the glowing teal ring, visible only when the plane is selected
 *   .plane-icon  – the rotating plane silhouette
 *   .plane-label – the callsign text (shown only when zoomed in)
 *
 * We rotate .plane-icon, not the whole marker, because Leaflet moves markers
 * around the map with a CSS transform on the outer element. Rotating that same
 * element would overwrite Leaflet's positioning.
 */
function createPlaneIcon() {
  return L.divIcon({
    className: 'plane-marker',
    iconSize: [ICON_SIZE, ICON_SIZE],
    // The "anchor" is the point of the icon that sits exactly on the aircraft's
    // position. We want the centre of the plane there, not its top-left corner.
    iconAnchor: [ICON_SIZE / 2, ICON_SIZE / 2],
    // Make popups open just above the plane instead of on top of it.
    popupAnchor: [0, -ICON_SIZE / 2 - 2],
    html: `
      <div class="plane-ring"></div>
      <div class="plane-icon">${PLANE_SVG}</div>
      <span class="plane-label"></span>`,
  });
}

// ---------------------------------------------------------------------------
// Popup content
// ---------------------------------------------------------------------------

// Worldwide emergency squawk codes, so we can highlight them.
const EMERGENCY_SQUAWKS = {
  7500: 'Hijack',
  7600: 'Radio failure',
  7700: 'Emergency',
};

/** Squawk code for display, highlighted (with words, not just colour) if it's an emergency. */
function formatSquawkHtml(squawk) {
  if (squawk === null) {
    return '—';
  }
  const meaning = EMERGENCY_SQUAWKS[squawk];
  if (meaning) {
    return `<span class="squawk-emergency">${escapeHtml(squawk)} · ${meaning}</span>`;
  }
  return escapeHtml(squawk);
}

/** The name we show for a plane: its callsign, or its ICAO address if it has none. */
function displayName(plane) {
  return plane.callsign ?? plane.icao24.toUpperCase();
}

/**
 * Build the popup's HTML. The data sits in a <dl> ("description list"), the
 * HTML element made for label/value pairs: <dt> is the label, <dd> the value.
 * CSS lays them out as a two-column grid, like an instrument readout.
 */
function buildPopupHtml(plane) {
  const verticalRate = describeVerticalRate(plane.verticalRate);

  return `
    <div class="popup-callsign">${escapeHtml(displayName(plane))}</div>
    <div class="popup-country">${escapeHtml(plane.originCountry ?? 'Unknown country')}</div>
    <dl class="popup-grid">
      <dt>Altitude</dt>
      <dd>${formatAltitude(plane)}</dd>

      <dt>Ground speed</dt>
      <dd>${formatSpeed(plane.velocity)}</dd>

      <dt>Vertical rate</dt>
      <dd>
        <span class="vs-arrow vs-${verticalRate.trend}" aria-hidden="true">${verticalRate.arrow}</span>
        ${verticalRate.text}
        <span class="sr-only">(${verticalRate.label})</span>
      </dd>

      <dt>Heading</dt>
      <dd>${formatHeading(plane.trueTrack)}</dd>

      <dt>Squawk</dt>
      <dd>${formatSquawkHtml(plane.squawk)}</dd>
    </dl>`;
  // Note: "Heading" here is really the TRACK (direction over the ground), which
  // is what OpenSky provides. See the trueTrack comment in lib/opensky.js.
}

// ---------------------------------------------------------------------------
// Keeping track of the markers
// ---------------------------------------------------------------------------

// Every aircraft currently on the map, keyed by its icao24 address.
// Each entry is { plane, marker }: the latest data, and its Leaflet marker.
// (A JavaScript Map keeps keys exactly as given, unlike a plain object, which
// would reorder number-like keys. That was the cause of the Stage 1 sorting bug.)
const aircraftByIcao = new Map();

// icao24 of the plane whose popup is open, or null if none.
let selectedIcao = null;

/** Rotate the icon, set the label and tooltip, and refresh the popup text. */
function updateMarkerDetails(entry) {
  const { plane, marker } = entry;
  const element = marker.getElement(); // the marker's HTML element on the page

  // Rotate to the direction of travel. Planes on the ground sometimes have no
  // track; pointing them north is a reasonable fallback.
  element.querySelector('.plane-icon').style.transform = `rotate(${plane.trueTrack ?? 0}deg)`;

  // textContent (unlike innerHTML) always treats text as text, so it's safe
  // to use with outside data.
  element.querySelector('.plane-label').textContent = displayName(plane);
  element.title = `${displayName(plane)} · ${formatAltitude(plane)}`; // hover tooltip

  marker.setPopupContent(buildPopupHtml(plane));
}

/** Mark one plane as selected (bigger, glowing ring) and draw it above the others. */
function setSelected(icao24, isSelected) {
  selectedIcao = isSelected ? icao24 : null;
  const entry = aircraftByIcao.get(icao24);
  // When a plane leaves the area with its popup open, Leaflet removes the
  // marker's element first and closes the popup afterwards, so the element
  // may already be gone (null) here.
  const element = entry?.marker.getElement();
  if (!element) {
    return;
  }
  element.classList.toggle('is-selected', isSelected);
  entry.marker.setZIndexOffset(isSelected ? 1000 : 0);
}

/** Create a marker for a plane we haven't seen before. */
function addAircraft(map, plane) {
  const marker = L.marker([plane.latitude, plane.longitude], {
    icon: createPlaneIcon(),
    keyboard: true, // can be reached with Tab and opened with Enter
    riseOnHover: true, // hovered plane is drawn on top of its neighbours
  });

  marker.bindPopup('', { maxWidth: 280, minWidth: 210, autoPanPadding: [40, 40] });

  // Opening a popup selects the plane; closing it deselects it.
  marker.on('popupopen', () => setSelected(plane.icao24, true));
  marker.on('popupclose', () => {
    if (selectedIcao === plane.icao24) {
      setSelected(plane.icao24, false);
    }
  });

  marker.addTo(map); // the marker's HTML element exists only after this

  const entry = { plane, marker };
  aircraftByIcao.set(plane.icao24, entry);
  updateMarkerDetails(entry);
}

/** Move an existing marker to the plane's new position and refresh its details. */
function updateExistingAircraft(entry, plane) {
  entry.plane = plane;
  entry.marker.setLatLng([plane.latitude, plane.longitude]);
  updateMarkerDetails(entry);
}

/**
 * Bring the map up to date with a new list of aircraft from the server:
 *   - planes we already show are moved and updated,
 *   - new planes get a marker,
 *   - planes that are no longer in the list (they left the area or stopped
 *     transmitting) are removed.
 */
export function updateAircraft(map, aircraftList) {
  const icaosInNewData = new Set();

  for (const plane of aircraftList) {
    icaosInNewData.add(plane.icao24);
    const existing = aircraftByIcao.get(plane.icao24);
    if (existing) {
      updateExistingAircraft(existing, plane);
    } else {
      addAircraft(map, plane);
    }
  }

  // Deleting from a Map while looping over it is safe in JavaScript.
  for (const [icao24, entry] of aircraftByIcao) {
    if (!icaosInNewData.has(icao24)) {
      entry.marker.remove(); // also closes its popup if it was open
      aircraftByIcao.delete(icao24);
    }
  }
}
