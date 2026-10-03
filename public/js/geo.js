/**
 * geo.js — maths for positions on the Earth's surface.
 *
 * Positions are latitude/longitude in degrees. Distances are in metres.
 * Bearings (directions) are in degrees clockwise from north, like a compass.
 */

import { MAX_PREDICTION_SECONDS, STALE_POSITION_SECONDS } from './config.js';

// The Earth's average radius.
const EARTH_RADIUS_METRES = 6_371_000;

// How many metres one degree of latitude covers. Going once around the Earth
// through both poles is 2 × π × R ≈ 40,030 km, and that circle is 360°, so
// one degree ≈ 40,030 km / 360 ≈ 111,195 m. This is the same everywhere.
const METRES_PER_DEGREE_OF_LATITUDE = (2 * Math.PI * EARTH_RADIUS_METRES) / 360;

/** JavaScript's Math.sin/cos work in radians: 180° = π radians. */
export function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Where do you end up if you travel `distanceMetres` from a point, in the
 * direction `bearingDegrees`?
 *
 * Step 1: split the trip into a "north" part and an "east" part.
 *
 *                 N
 *                 ↑         ✈  (where we end up)
 *                 |        /
 *     metresNorth |       / distance
 *                 |      /
 *                 |  θ  /        θ = bearing, measured clockwise from north
 *                 |   /
 *                 ✈ ————————→ E
 *                   metresEast
 *
 *     metresNorth = distance × cos(θ)
 *     metresEast  = distance × sin(θ)
 *
 *   (In school maths, angles start from the x-axis (east) and go
 *   anticlockwise, so x uses cos and y uses sin. Compass bearings start from
 *   north and go clockwise, which swaps them: north uses cos, east uses sin.)
 *
 * Step 2: turn metres into degrees.
 *   - Latitude: divide by ~111,195 m per degree (the same everywhere).
 *   - Longitude: lines of longitude meet at the poles, so a degree of
 *     longitude gets SHORTER as you move away from the equator: it's
 *     111,195 m × cos(latitude). At Muscat (23.6° N) that's about 101,900 m.
 *
 * This treats the Earth as flat over the short distance travelled. Compared
 * with the exact "great-circle" formula (which treats the Earth as a sphere),
 * it's off by about 2 m over the ~7.5 km an airliner flies in 30 seconds, and
 * under 50 m over 36 km (2 minutes): less than one pixel at zoom 8. For long
 * trips (hundreds of km) navigators use the great-circle formula instead.
 */
export function movePoint(latitude, longitude, distanceMetres, bearingDegrees) {
  const bearing = degreesToRadians(bearingDegrees);
  const metresNorth = distanceMetres * Math.cos(bearing);
  const metresEast = distanceMetres * Math.sin(bearing);

  const metresPerDegreeOfLongitude =
    METRES_PER_DEGREE_OF_LATITUDE * Math.cos(degreesToRadians(latitude));

  return [
    latitude + metresNorth / METRES_PER_DEGREE_OF_LATITUDE,
    longitude + metresEast / metresPerDegreeOfLongitude,
  ];
}

/**
 * The distance in metres between two [latitude, longitude] points, measured
 * along the Earth's curved surface (the "great-circle" distance, the shortest
 * path on a sphere), using the HAVERSINE formula.
 *
 * The idea: picture lines from the centre of the Earth out to each point. The
 * distance along the surface is the radius × the angle between those lines
 * (in radians), just like the arc length of a circle: arc = r × angle.
 * The haversine formula is a numerically reliable way to get that angle:
 *
 *   a = sin²(Δlat / 2) + cos(lat1) × cos(lat2) × sin²(Δlon / 2)
 *   angle = 2 × atan2(√a, √(1 − a))
 *   distance = Earth's radius × angle
 *
 * (Δ, "delta", means "the difference in". Navigators have used this formula
 * since the 1800s, when sailors worked it out with printed tables.)
 */
export function distanceBetween([latitude1, longitude1], [latitude2, longitude2]) {
  const lat1 = degreesToRadians(latitude1);
  const lat2 = degreesToRadians(latitude2);
  const deltaLat = degreesToRadians(latitude2 - latitude1);
  const deltaLon = degreesToRadians(longitude2 - longitude1);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const angle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METRES * angle;
}

/**
 * How many seconds ago the plane's position was measured, or null if unknown.
 * Uses your computer's clock, which is normally kept within a second of the
 * real time automatically.
 */
export function secondsSincePositionReport(plane) {
  if (plane.timePosition === null) {
    return null;
  }
  return Date.now() / 1000 - plane.timePosition; // Date.now() is in milliseconds
}

/**
 * DEAD RECKONING: estimate where a plane is NOW from its last reported
 * position, speed, and track. Sailors and pilots navigated this way long
 * before GPS: "I was here, going this fast in this direction, for this long,
 * so now I must be about there."
 *
 *   time elapsed = now − time of the last position report
 *   distance     = speed × time elapsed        (m/s × s = m)
 *   new position = movePoint(last position, distance, track)
 *
 * It assumes the plane flies straight at a constant speed, so it drifts off
 * when a plane turns or slows down. That's why each new report from the server
 * corrects the position.
 *
 * Returns [latitude, longitude].
 */
export function predictPosition(plane) {
  const lastReported = [plane.latitude, plane.longitude];

  // We can only predict if we know the speed, the direction, and when the
  // position was measured.
  const secondsSinceReport = secondsSincePositionReport(plane);
  if (plane.velocity === null || plane.trueTrack === null || secondsSinceReport === null) {
    return lastReported;
  }

  // Clamp between 0 and a maximum. Below 0 can happen if your computer's clock
  // is slightly behind OpenSky's. The maximum stops a plane whose position is
  // very old from being pushed far past where it could plausibly be.
  const secondsToPredict = Math.min(Math.max(secondsSinceReport, 0), MAX_PREDICTION_SECONDS);

  const distanceMetres = plane.velocity * secondsToPredict;
  return movePoint(plane.latitude, plane.longitude, distanceMetres, plane.trueTrack);
}

/** True if the plane's last position report is too old to trust (a "coasting" track). */
export function isPositionStale(plane) {
  const age = secondsSincePositionReport(plane);
  return age !== null && age > STALE_POSITION_SECONDS;
}
