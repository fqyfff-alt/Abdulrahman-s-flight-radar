/**
 * borders.js — loads the outlines of Oman and its neighbours and draws them
 * on the map as SVG paths (which intro.js then animates).
 */

import { BORDERS_INTEGRITY, BORDERS_URL, NEIGHBOR_IDS, OMAN_ID } from './config.js';

// The drawn <path> elements, once drawBorders() has run.
let borderPaths = null;

/**
 * Download the border data and pick out Oman and its neighbours.
 * Resolves to { oman, neighbors } (GeoJSON features), or to null if anything
 * goes wrong. The map works fine without borders, so a failure just means
 * no opening animation.
 */
export async function loadBorders() {
  try {
    // `topojson` comes from the topojson-client <script> tag in index.html.
    if (typeof topojson === 'undefined') {
      throw new Error('the topojson-client library did not load');
    }

    // "integrity" makes the browser check the file's fingerprint, exactly like
    // the integrity attribute on the <script> tags.
    const response = await fetch(BORDERS_URL, { integrity: BORDERS_INTEGRITY });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const topology = await response.json();

    // TOPOJSON vs GEOJSON
    // GeoJSON stores each country as its own list of points, so a border
    // shared by two countries is stored twice. TopoJSON stores each stretch of
    // border (an "arc") only once, and each country just lists which arcs go
    // around it. That makes the file much smaller. topojson.feature() turns it
    // back into ordinary GeoJSON, which Leaflet understands.
    const countries = topojson.feature(topology, topology.objects.countries).features;

    // MATCHING THE COUNTRIES
    // Every country in world-atlas has an `id`: its ISO 3166-1 numeric code,
    // an international standard number that doesn't change (Oman is "512").
    // We match on these codes instead of names, because names can be written
    // in different ways ("Iran" or "Iran (Islamic Republic of)") or change
    // over time. Each country also has properties.name, handy for checking.
    const findCountry = (id) => countries.find((country) => country.id === id);

    const oman = findCountry(OMAN_ID);
    if (!oman) {
      throw new Error('Oman is missing from the border data');
    }
    const neighbors = NEIGHBOR_IDS.map(findCountry).filter(Boolean); // keeps the drawing order
    return { oman, neighbors };
  } catch (error) {
    console.warn(`Country borders unavailable (${error.message}); skipping the opening animation.`);
    return null;
  }
}

/** Add one country to the map and return its SVG <path> element. */
function addCountry(map, feature, className, renderer) {
  const layer = L.geoJSON(feature, {
    pane: 'borders',
    renderer,
    className, // must be set here: Leaflet only applies a class when it creates the path
    interactive: false, // clicks go straight through to the map
    fill: false, // outline only
    lineCap: 'butt', // flat line ends (round ones leave a dot when the line is "undrawn")
  }).addTo(map);
  // L.geoJSON makes a group; our single country is its first (only) layer.
  return layer.getLayers()[0].getElement();
}

/**
 * Draw the borders and return their paths: { omanPath, neighborPaths }.
 * Safe to call more than once: later calls return the same paths.
 */
export function drawBorders(map, { oman, neighbors }) {
  if (borderPaths) {
    return borderPaths;
  }

  // The borders get their own "pane" (a layer of the map) placed above the
  // map tiles (z-index 200) but below the trails (400) and planes (600).
  map.createPane('borders');
  map.getPane('borders').style.zIndex = 350;

  // Use the SVG renderer, not canvas: SVG makes every border a real <path>
  // element on the page, which CSS and JavaScript can style and animate.
  const renderer = L.svg({ pane: 'borders' });

  // Neighbours first, then Oman, so Oman's teal line sits on top of the
  // borders it shares with them.
  const neighborPaths = neighbors.map((country) =>
    addCountry(map, country, 'border border-neighbor', renderer),
  );
  const omanPath = addCountry(map, oman, 'border border-oman', renderer);

  borderPaths = { omanPath, neighborPaths };
  return borderPaths;
}

/**
 * Remove the dash settings used by the drawing animation.
 * Leaflet redraws border paths whenever the map zooms, and each redraw has a
 * different length. Dash settings measured for the old length would then
 * chop the borders into pieces, so they must go once the drawing is done.
 */
export function clearBorderDashes() {
  if (!borderPaths) {
    return;
  }
  for (const path of [borderPaths.omanPath, ...borderPaths.neighborPaths]) {
    path.style.strokeDasharray = '';
    path.style.strokeDashoffset = '';
  }
}
