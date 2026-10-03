/**
 * intro.js — the opening animation (about 4 seconds):
 *
 *   0.0 s   dark screen; Oman's outline draws itself in glowing teal…
 *   0.25 s  …and the neighbouring countries follow, one after another, in grey
 *   ~2.2 s  outlines finished: the map fades in as the view glides in to Muscat
 *   ~3.4 s  status bar, side panel and aircraft fade in; radar rings expand
 *   ~4.2 s  done: you can drag and zoom the map
 *
 * Click or press any key to skip straight to the end. There's no animation
 * if your device asks for reduced motion, or if the border data can't be
 * loaded: the map just appears.
 *
 * Most of the fading is done by CSS. index.html starts <body> with the
 * classes "intro-active" and "intro-drawing"; this file removes them at the
 * right moments, and style.css ("Opening animation") fades things in.
 */

import { clearBorderDashes, drawBorders } from './borders.js';
import { INTRO, MAP_CENTER, MAP_START_ZOOM } from './config.js';
import { refreshPopupPadding } from './layout.js';

// Animations that are running, so a skip can jump them all to the end.
const runningAnimations = [];

// Skipping: skipRequested becomes true and the `skipped` Promise resolves,
// which makes any step that is waiting stop waiting.
let skipRequested = false;
let resolveSkipped;
const skipped = new Promise((resolve) => {
  resolveSkipped = resolve;
});

function requestSkip() {
  skipRequested = true;
  resolveSkipped();
}

/** Wait for `promise`, or stop waiting as soon as the user skips. */
function untilDoneOrSkipped(promise) {
  return Promise.race([promise, skipped]);
}

/** A Promise that resolves after `ms` milliseconds. */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stop (or allow) dragging and zooming the map. */
function setMapLocked(map, locked) {
  const handlers = [
    map.dragging,
    map.touchZoom,
    map.doubleClickZoom,
    map.scrollWheelZoom,
    map.boxZoom,
    map.keyboard,
  ];
  for (const handler of handlers) {
    if (locked) {
      handler.disable();
    } else {
      handler.enable();
    }
  }
}

/**
 * THE LINE-DRAWING TRICK: stroke-dasharray + stroke-dashoffset
 *
 * SVG can draw any line as dashes. "stroke-dasharray: 10px" means
 * "10 px of line, then a 10 px gap, repeat", and "stroke-dashoffset" slides
 * that dash pattern along the line.
 *
 * Make ONE dash exactly as long as the whole outline (getTotalLength()
 * measures it in pixels):
 *
 *   stroke-dasharray: L     ██████████████████░░░░░░░░░░░░░░░░░░
 *                           |← dash, length L →|← gap, length L →|
 *
 *   stroke-dashoffset: L    the pattern slides back by L, so the GAP lies
 *                           over the outline: nothing is visible.
 *   stroke-dashoffset: 0    the DASH lies over the outline: fully drawn.
 *
 * Animating the offset from L down to 0 slides the dash in bit by bit, so the
 * outline seems to draw itself from its starting point all the way around.
 * "ease-in-out" timing starts slowly, speeds up, then slows down at the end.
 */
function drawOutline(path, { duration, delay }) {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length}px`;
  path.style.strokeDashoffset = '0px'; // where it ends up: fully drawn

  // The Web Animations API: element.animate(keyframes, options).
  return path.animate([{ strokeDashoffset: `${length}px` }, { strokeDashoffset: '0px' }], {
    duration,
    delay,
    easing: 'ease-in-out',
    fill: 'backwards', // during the delay, show the first keyframe (invisible)
  });
}

/** Grow each radar range ring outwards from the airport, one after another. */
function expandRangeRings() {
  document.querySelectorAll('path.range-ring').forEach((ring, index) => {
    const animation = ring.animate(
      [
        { transform: 'scale(0.2)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      {
        duration: INTRO.ringExpandMs,
        delay: index * INTRO.ringStaggerMs,
        easing: 'ease-out',
        fill: 'backwards',
      },
    );
    runningAnimations.push(animation);
  });
}

/** Glide from the wide view in to Muscat; resolves when the map stops moving. */
function flyToMuscat(map) {
  return new Promise((resolve) => {
    map.once('moveend', resolve);
    map.flyTo(MAP_CENTER, MAP_START_ZOOM, { duration: INTRO.flyToMuscatSeconds });
  });
}

/** End the intro, from any point: show everything and unlock the map. */
function finishIntro(map) {
  for (const animation of runningAnimations) {
    animation.finish(); // jump to the end
  }
  clearBorderDashes();

  if (skipRequested) {
    map.stop(); // cancel a flight that's in progress
    map.setView(MAP_CENTER, MAP_START_ZOOM, { animate: false });
  }

  document.body.classList.remove('intro-active', 'intro-drawing', 'intro-tiles');
  setMapLocked(map, false);
  document.removeEventListener('keydown', requestSkip);
  document.removeEventListener('pointerdown', requestSkip);
  refreshPopupPadding();
}

/** Draw the borders whenever their data arrives (used when there's no animation). */
function showBordersWhenReady(map, bordersPromise) {
  bordersPromise.then((borders) => {
    if (borders) {
      drawBorders(map, borders);
    }
  });
}

/**
 * Play the whole opening sequence. `bordersPromise` comes from loadBorders()
 * (started earlier, so the download overlaps with setting up the page).
 * Aircraft data is already loading in the background (see main.js).
 */
export async function playIntro(map, bordersPromise) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finishIntro(map);
    showBordersWhenReady(map, bordersPromise);
    return;
  }

  setMapLocked(map, true);
  document.addEventListener('keydown', requestSkip);
  document.addEventListener('pointerdown', requestSkip);

  // STEP 0: wait for the border data, but not forever.
  const tooSlow = pause(INTRO.borderLoadTimeoutMs).then(() => null);
  const borders = await untilDoneOrSkipped(Promise.race([bordersPromise, tooSlow]));
  if (!borders) {
    // Failed, too slow, or skipped: just show the map.
    finishIntro(map);
    showBordersWhenReady(map, bordersPromise);
    return;
  }

  // STEP 1: zoom out until all of Oman fits on screen, then draw the outlines.
  // (At zoom 8 most of Oman would be off-screen, especially on a phone.)
  map.fitBounds(L.geoJSON(borders.oman).getBounds(), { padding: [24, 24], animate: false });
  const { omanPath, neighborPaths } = drawBorders(map, borders);

  runningAnimations.push(drawOutline(omanPath, { duration: INTRO.omanDrawMs, delay: 0 }));
  neighborPaths.forEach((path, index) => {
    const delay = INTRO.neighborsStartMs + index * INTRO.neighborStaggerMs;
    runningAnimations.push(drawOutline(path, { duration: INTRO.neighborDrawMs, delay }));
  });
  await untilDoneOrSkipped(Promise.all(runningAnimations.map((animation) => animation.finished)));
  if (skipRequested) {
    finishIntro(map);
    return;
  }

  // STEP 2: remove the dash settings BEFORE zooming (see clearBorderDashes),
  // calm the borders down to their final style, fade the map tiles in, and
  // glide in to Muscat.
  clearBorderDashes();
  document.body.classList.remove('intro-drawing');
  document.body.classList.add('intro-tiles');
  await untilDoneOrSkipped(flyToMuscat(map));
  if (skipRequested) {
    finishIntro(map);
    return;
  }

  // STEP 3: fade in the status bar, side panel and aircraft; expand the rings.
  document.body.classList.remove('intro-active');
  expandRangeRings();
  await untilDoneOrSkipped(pause(INTRO.ringExpandMs + 2 * INTRO.ringStaggerMs));

  finishIntro(map);
}
