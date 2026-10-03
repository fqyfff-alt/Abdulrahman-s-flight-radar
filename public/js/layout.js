/**
 * layout.js — works out which parts of the map are hidden behind the status
 * bar and the side panel, so that popups and "fly to plane" can keep planes in
 * the part of the map you can actually see.
 */

// The same breakpoint as the @media rule in style.css: at 720 px wide or less,
// the side panel becomes a bottom sheet.
const PHONE_LAYOUT = window.matchMedia('(max-width: 720px)');

// Breathing room between a plane/popup and the edge of a panel, in pixels.
const GAP = 12;

export function isPhoneLayout() {
  return PHONE_LAYOUT.matches;
}

/**
 * How many pixels are covered on each side of the map: { top, right, bottom, left }.
 *   Laptop: the status bar covers the top, the side panel covers the left.
 *   Phone:  the status bar covers the top, the bottom sheet covers the bottom.
 */
export function getCoveredEdges() {
  const statusBar = document.getElementById('status-bar');
  const panel = document.getElementById('side-panel');
  const panelHeader = document.getElementById('panel-toggle');
  const isPanelExpanded = panel.classList.contains('is-expanded');

  const top = statusBar.offsetHeight + GAP;

  if (isPhoneLayout()) {
    // On phones the legend and zoom buttons sit over the top of the map too.
    const legend = document.getElementById('legend').getBoundingClientRect();
    const zoomButtons = document.querySelector('.zoom-controls').getBoundingClientRect();
    // When the sheet is closed, only its header strip is showing.
    const sheetHeight = isPanelExpanded ? panel.offsetHeight : panelHeader.offsetHeight;
    return {
      top: legend.bottom + GAP,
      right: window.innerWidth - zoomButtons.left + GAP,
      bottom: sheetHeight + GAP,
      left: GAP,
    };
  }

  if (!isPanelExpanded) {
    // A collapsed panel is just its header, under the status bar.
    return { top: panel.offsetTop + panel.offsetHeight + GAP, right: GAP, bottom: GAP, left: GAP };
  }
  return { top, right: GAP, bottom: GAP, left: panel.offsetLeft + panel.offsetWidth + GAP };
}

/**
 * Padding for Leaflet popups. When a popup opens, Leaflet pans the map so the
 * popup stays at least this far from the edges.
 *
 * Every popup is given THESE SAME two arrays (not copies). Leaflet reads them
 * each time a popup opens, so changing the numbers inside the arrays (when the
 * window is resized or the panel opens/closes) updates every popup at once.
 */
export const popupPaddingTopLeft = [GAP, GAP];
export const popupPaddingBottomRight = [GAP, GAP];

export function refreshPopupPadding() {
  const edges = getCoveredEdges();
  popupPaddingTopLeft[0] = edges.left;
  popupPaddingTopLeft[1] = edges.top;
  popupPaddingBottomRight[0] = edges.right;
  popupPaddingBottomRight[1] = edges.bottom;
}

window.addEventListener('resize', refreshPopupPadding);
