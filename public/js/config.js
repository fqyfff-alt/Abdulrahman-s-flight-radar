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

// How often to ask our server for the airport weather. METARs only change
// every 30–60 minutes, and the server caches them for 10 minutes too.
export const WEATHER_REFRESH_INTERVAL_MS = 10 * 60_000;

// Weather reports older than this are shown in amber, as a warning that they
// may be out of date (normally a new METAR arrives every 30–60 minutes).
export const WEATHER_OLD_AFTER_MINUTES = 90;

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

// When you click a plane in the side panel, zoom in to at least this level.
export const FOCUS_ZOOM = 10;

// ---------------------------------------------------------------------------
// Muscat International Airport and the "radar scope" around it
// ---------------------------------------------------------------------------

export const AIRPORT = {
  icao: 'OOMS', // the code pilots and air traffic control use
  iata: 'MCT', // the code printed on tickets and luggage tags
  name: 'Muscat International Airport',
  position: [23.593, 58.284],
  // Runway numbers are the runway's compass direction divided by 10. Muscat's
  // parallel runways are numbered 08 and 26: they point about 080° and 260°.
  runwayHeading: 80,
};

// Faint circles around the airport, like the range rings on a radar screen.
export const RANGE_RINGS_KM = [25, 50, 100];

// "Nearby" for the aircraft count next to the airport marker.
export const NEARBY_RADIUS_KM = 30;

// Likely arrivals (a rough guess; see airspace.js): planes closer than this,
// lower than this, and descending.
export const ARRIVAL_MAX_DISTANCE_KM = 60;
export const ARRIVAL_MAX_ALTITUDE_FEET = 10_000;

// ---------------------------------------------------------------------------
// Opening animation: country borders (see borders.js and intro.js)
// ---------------------------------------------------------------------------

// Country outlines from the "world-atlas" package (made from Natural Earth
// data) in TopoJSON format. The version is pinned exactly, so the integrity
// fingerprint always matches the file.
export const BORDERS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
export const BORDERS_INTEGRITY = 'sha256-BDQs3B4wFrzX2xYw3pVoTWe3n+PIxGAyHoeu9GlQI5Q=';

// Countries are matched by their ISO 3166-1 numeric code (see borders.js).
export const OMAN_ID = '512';
// Neighbours, in the order they draw in:
export const NEIGHBOR_IDS = [
  '784', // United Arab Emirates
  '682', // Saudi Arabia
  '887', // Yemen
  '634', // Qatar
  '364', // Iran
  '586', // Pakistan
];

// Timings, in milliseconds unless the name says otherwise. (The fades are CSS
// transitions; see "Opening animation" in style.css.)
export const INTRO = {
  borderLoadTimeoutMs: 3000, // give up on the animation if borders take longer
  omanDrawMs: 1800,
  neighborsStartMs: 250, // the first neighbour starts this long after Oman
  neighborStaggerMs: 180, // each further neighbour starts this much later
  neighborDrawMs: 1000,
  flyToMuscatSeconds: 1.2, // Leaflet's flyTo takes seconds
  ringExpandMs: 800,
  ringStaggerMs: 120,
};
