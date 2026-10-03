/**
 * map.js — creates the Leaflet map with the dark theme.
 *
 * `L` is the Leaflet library. It's loaded by a normal <script> tag in
 * index.html, which makes it a global variable that every file can use.
 */

import {
  LABEL_MIN_ZOOM,
  MAP_CENTER,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_START_ZOOM,
  TILE_ATTRIBUTION,
  TILE_URL,
} from './config.js';

/**
 * Create the map inside <div id="map"> and return it.
 * `cartoApiKey` comes from the server (/api/config), which reads it from .env.
 */
export function createMap({ cartoApiKey }) {
  const map = L.map('map', {
    center: MAP_CENTER,
    zoom: MAP_START_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    zoomControl: false, // hide Leaflet's default buttons; we use our own themed ones
  });

  L.tileLayer(buildTileUrl(cartoApiKey), {
    attribution: TILE_ATTRIBUTION,
    maxZoom: MAP_MAX_ZOOM,
    className: 'map-tiles', // lets style.css dim the tiles without dimming the planes
  }).addTo(map);

  setUpZoomButtons(map);
  setUpLabelToggle(map);
  setUpEscapeToClose(map);
  return map;
}

/** Add the CARTO key to the tile address, or warn if there isn't one. */
function buildTileUrl(cartoApiKey) {
  if (!cartoApiKey) {
    console.warn('No CARTO_API_KEY in .env: map tiles will show an "API key required" watermark. See README.');
    return TILE_URL;
  }
  // encodeURIComponent makes any unusual characters in the key safe for a URL.
  return `${TILE_URL}?key=${encodeURIComponent(cartoApiKey)}`;
}

/**
 * Close the open popup when Escape is pressed. Leaflet does this itself only
 * while the map has keyboard focus, but clicking a plane moves the focus to
 * the plane, so we listen on the whole page instead.
 */
function setUpEscapeToClose(map) {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      map.closePopup();
    }
  });
}

/** Connect our own + and − buttons (in index.html) to the map. */
function setUpZoomButtons(map) {
  const zoomInButton = document.getElementById('zoom-in');
  const zoomOutButton = document.getElementById('zoom-out');

  zoomInButton.addEventListener('click', () => map.zoomIn());
  zoomOutButton.addEventListener('click', () => map.zoomOut());

  // Grey out a button when you can't zoom any further in that direction.
  function updateButtons() {
    zoomInButton.disabled = map.getZoom() >= map.getMaxZoom();
    zoomOutButton.disabled = map.getZoom() <= map.getMinZoom();
  }
  map.on('zoomend', updateButtons);
  updateButtons();
}

/**
 * Callsign labels are only readable when zoomed in. Instead of touching every
 * label, we add or remove ONE class on the map container, and style.css shows
 * the labels only inside `.show-labels`.
 */
function setUpLabelToggle(map) {
  function updateLabels() {
    const zoomedInEnough = map.getZoom() >= LABEL_MIN_ZOOM;
    map.getContainer().classList.toggle('show-labels', zoomedInEnough);
  }
  map.on('zoomend', updateLabels);
  updateLabels();
}
