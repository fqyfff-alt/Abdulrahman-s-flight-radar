/**
 * api.js — talks to OUR backend (server.js), never to OpenSky directly.
 * (The server keeps the OpenSky secret private and caches the data.)
 */

/**
 * Ask our server for the settings the page needs at startup:
 *   { cartoApiKey }  (the map-tile key, or null if it isn't set in .env)
 * If this fails, carry on without a key: the map still works, just watermarked.
 */
export async function fetchMapConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(`Could not load /api/config (${error.message}); continuing without a map key.`);
    return { cartoApiKey: null };
  }
}

/**
 * Ask our server for the current aircraft.
 * Resolves to the JSON from /api/aircraft:
 *   { timestamp, aircraftCount, creditsRemaining, rateLimited, retryAfterSeconds, fromCache, aircraft }
 * Throws an Error if the server can't be reached or reports a problem.
 */
export async function fetchAircraftData() {
  // A relative address ("/api/...") goes to the same server that sent us this page.
  const response = await fetch('/api/aircraft');

  // Our server always answers in JSON, even for errors: { "error": "..." }
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? `Server error (HTTP ${response.status})`);
  }
  return data;
}
