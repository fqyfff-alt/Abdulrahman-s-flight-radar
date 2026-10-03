/**
 * airport.js — Muscat International Airport (OOMS) on the map:
 *   - a special airport marker, with a label showing how many aircraft are
 *     within 30 km,
 *   - faint radar-style range rings at 25, 50 and 100 km, with labels.
 */

import { AIRPORT, NEARBY_RADIUS_KM, RANGE_RINGS_KM } from './config.js';
import { movePoint } from './geo.js';

const AIRPORT_ICON_SIZE = 28;

/**
 * The airport symbol: a circle with two parallel runways inside. The runways
 * are drawn pointing north, then rotated to Muscat's real runway direction.
 * (In SVG, rotate(angle cx cy) turns clockwise around the point cx,cy, the
 * same direction as compass bearings.)
 */
const AIRPORT_SVG = `
  <svg viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="11" />
    <g transform="rotate(${AIRPORT.runwayHeading} 14 14)">
      <line x1="11" y1="6" x2="11" y2="22" />
      <line x1="17" y1="6" x2="17" y2="22" />
    </g>
  </svg>`;

let airportMarker = null;

/** Draw the rings and the airport marker. Call once at startup. */
export function initAirport(map) {
  drawRangeRings(map);

  airportMarker = L.marker(AIRPORT.position, {
    icon: L.divIcon({
      className: 'airport-marker',
      iconSize: [AIRPORT_ICON_SIZE, AIRPORT_ICON_SIZE],
      iconAnchor: [AIRPORT_ICON_SIZE / 2, AIRPORT_ICON_SIZE / 2],
      popupAnchor: [0, -AIRPORT_ICON_SIZE / 2],
      html: `${AIRPORT_SVG}
        <span class="airport-label">
          <span class="airport-code">${AIRPORT.icao}</span>
          <span class="airport-count">–</span>
        </span>`,
    }),
    title: AIRPORT.name,
    keyboard: true,
    zIndexOffset: -1000, // draw planes on top of the airport, not underneath
  });
  airportMarker.bindPopup(buildAirportPopupHtml({ nearbyCount: null, arrivals: [] }), {
    minWidth: 210,
  });
  airportMarker.addTo(map);
}

/** Draw the range rings, each with a small distance label at its top (north). */
function drawRangeRings(map) {
  for (const km of RANGE_RINGS_KM) {
    // L.circle takes its radius in METRES, so it stays the right size at every zoom.
    L.circle(AIRPORT.position, {
      radius: km * 1000,
      className: 'range-ring', // colour and opacity come from style.css
      weight: 1,
      fill: false,
      interactive: false,
    }).addTo(map);

    // The label sits on the ring, due north of the airport.
    const [latitude, longitude] = AIRPORT.position;
    const labelPosition = movePoint(latitude, longitude, km * 1000, 0);
    L.marker(labelPosition, {
      icon: L.divIcon({
        className: 'range-label',
        iconSize: [48, 14],
        iconAnchor: [24, 7], // centre the label on the ring
        html: `<span>${km} km</span>`,
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: -2000,
    }).addTo(map);
  }
}

function buildAirportPopupHtml({ nearbyCount, arrivals }) {
  return `
    <div class="popup-callsign">${AIRPORT.icao}</div>
    <div class="popup-country">${AIRPORT.name} · ${AIRPORT.iata}</div>
    <dl class="popup-grid">
      <dt>Within ${NEARBY_RADIUS_KM} km</dt>
      <dd>${nearbyCount ?? '–'} aircraft</dd>
      <dt>Likely arrivals</dt>
      <dd>${arrivals.length}</dd>
    </dl>`;
}

/** Update the label and popup with the latest numbers (see airspace.js). */
export function updateAirport(summary) {
  const countText = `${summary.nearbyCount} within ${NEARBY_RADIUS_KM} km`;
  airportMarker.getElement().querySelector('.airport-count').textContent = countText;
  airportMarker.setPopupContent(buildAirportPopupHtml(summary));
}
