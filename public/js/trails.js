/**
 * trails.js — the fading line behind each plane, showing where it has been.
 *
 * A trail connects the plane's last few REPORTED positions (one per data
 * update, every 30 s) and ends at where the plane is drawn right now.
 *
 * SVG can't fade a single line gradually along its length, so a trail is made
 * of separate short segments, each with its own opacity: the oldest segment is
 * nearly transparent and the newest is nearly solid.
 *
 *    oldest ·····‑‑‑‑‑————————✈ now
 */

import { TRAIL_LENGTH, TRAIL_MAX_OPACITY } from './config.js';

// A Leaflet "layer group" holding every trail segment, so they can be managed
// together. Created by initTrails().
let trailLayer = null;

/** Call once at startup, after the map exists. */
export function initTrails(map) {
  trailLayer = L.layerGroup().addTo(map);
}

/** Make a new, empty trail for one plane. */
export function createTrail() {
  return {
    points: [], // reported positions, oldest first: { latLng: [lat, lon], band: 'low' }
    segments: [], // the Leaflet lines currently drawn
  };
}

/**
 * Remember a newly reported position. We store the altitude band with each
 * point, so a climbing plane's trail changes colour along its length.
 */
export function addTrailPoint(trail, latLng, band) {
  trail.points.push({ latLng, band });
  if (trail.points.length > TRAIL_LENGTH) {
    trail.points.shift(); // forget the oldest point
  }
}

/** Remove a trail's lines from the map. */
export function removeTrail(trail) {
  for (const segment of trail.segments) {
    trailLayer.removeLayer(segment);
  }
  trail.segments = [];
}

/**
 * (Re)draw the whole trail: one segment from each reported point to the next,
 * plus a last segment from the newest point to the plane's current position.
 * Called when new data arrives.
 */
export function drawTrail(trail, currentLatLng) {
  removeTrail(trail);

  const segmentCount = trail.points.length; // one segment starts at each point

  for (let i = 0; i < segmentCount; i++) {
    const from = trail.points[i];
    // The last segment ends at the plane itself.
    const toLatLng = i + 1 < segmentCount ? trail.points[i + 1].latLng : currentLatLng;

    // Segment 0 (oldest) is the faintest; the last segment is the strongest.
    // e.g. with 4 segments: 0.225, 0.45, 0.675, 0.9
    const opacity = (TRAIL_MAX_OPACITY * (i + 1)) / segmentCount;

    const segment = L.polyline([from.latLng, toLatLng], {
      // Coloured by the altitude where the segment STARTS, so every recorded
      // position shows its own colour. The colour itself comes from style.css.
      className: `trail alt-${from.band}`,
      weight: 2, // line width in pixels
      opacity,
      interactive: false, // clicks go straight through to the map and planes
    });
    trailLayer.addLayer(segment);
    trail.segments.push(segment);
  }
}

/**
 * Called every second as the plane moves: stretch the newest segment so it
 * still ends exactly at the plane. (Cheaper than redrawing the whole trail.)
 */
export function updateTrailHead(trail, currentLatLng) {
  const newestSegment = trail.segments.at(-1); // .at(-1) = last item
  const newestPoint = trail.points.at(-1);
  if (newestSegment && newestPoint) {
    newestSegment.setLatLngs([newestPoint.latLng, currentLatLng]);
  }
}
