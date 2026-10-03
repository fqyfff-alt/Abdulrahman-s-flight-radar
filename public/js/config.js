/**
 * config.js — all the frontend settings in one place, so they're easy to find
 * and tweak. Other files import what they need from here.
 */

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

// Where the map starts. Leaflet always writes positions as [latitude, longitude]
// (north/south first, then east/west).
export const MAP_CENTER = [23.59, 58.38]; // Muscat

// Zoom level 0 shows the whole world in one 256-pixel tile; every level up
// doubles the detail. At zoom 8 near Muscat, one screen pixel is about 560 m,
// so a laptop screen shows roughly 700 km across.
export const MAP_START_ZOOM = 8;
export const MAP_MIN_ZOOM = 5; // no point zooming out to the whole world
export const MAP_MAX_ZOOM = 18;

// Show the callsign label next to each plane at this zoom level or closer.
export const LABEL_MIN_ZOOM = 9;

// CARTO "Dark Matter" map tiles. {z}/{x}/{y} picks the tile; {r} becomes "@2x"
// on high-resolution (retina) screens for sharper tiles. Since September 2026
// CARTO needs a free API key, added as ?key=… (map.js does that). Without a
// key, every tile shows an "API key required" watermark.
export const TILE_URL = 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png';

// The map data and tiles are free to use as long as we credit them.
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attribution/">CARTO</a> · ' +
  'Flight data &copy; <a href="https://opensky-network.org">OpenSky Network</a>';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// How often to ask OUR server for fresh aircraft (milliseconds). The server
// caches OpenSky's answer for 20 s, so 30 s means each refresh normally gets
// brand-new data and costs 1 OpenSky credit.
export const REFRESH_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Aircraft appearance and motion
// ---------------------------------------------------------------------------

// Altitude colour bands, in feet. The colours themselves are the
// --color-alt-* variables in style.css.
//   on the ground → grey,  below 10,000 → green,
//   10,000–25,000 → amber, above 25,000 → blue
export const LOW_ALTITUDE_MAX_FEET = 10_000;
export const MID_ALTITUDE_MAX_FEET = 25_000;

// Smooth motion: move every plane forward this often (milliseconds).
export const ANIMATION_INTERVAL_MS = 1_000;

// Never predict more than this many seconds past a plane's last reported
// position. Normal data is under a minute old; anything older is too
// uncertain to extrapolate further (the plane may have turned).
export const MAX_PREDICTION_SECONDS = 120;

// A plane whose last position report is older than this is drawn dimmed: a
// "coasting" track, as air traffic controllers call it. Around Oman, OpenSky
// often goes minutes without hearing from a plane, because ground receivers
// are few and far between, especially over the sea.
export const STALE_POSITION_SECONDS = 60;

// Trails: how many reported positions to keep per plane. With one report per
// 30-second refresh, 10 positions is about the last 5 minutes of flight.
export const TRAIL_LENGTH = 10;
export const TRAIL_MAX_OPACITY = 0.9; // the newest segment's opacity (1 = solid)
