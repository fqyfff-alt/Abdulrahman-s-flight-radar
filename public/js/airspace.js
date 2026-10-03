/**
 * airspace.js — questions about the traffic around Muscat airport:
 *   - How far is each plane from the airport?
 *   - How many planes are nearby?
 *   - Which planes are probably about to land at Muscat, and roughly when?
 *
 * Everything here is plain calculation (no drawing), so it's easy to test.
 */

import {
  AIRPORT,
  ARRIVAL_MAX_ALTITUDE_FEET,
  ARRIVAL_MAX_DISTANCE_KM,
  NEARBY_RADIUS_KM,
} from './config.js';
import { describeVerticalRate, metresToFeet } from './format.js';
import { distanceBetween, predictPosition } from './geo.js';

/** Distance in km from the plane's current (estimated) position to the airport. */
export function distanceToAirportKm(plane) {
  return distanceBetween(predictPosition(plane), AIRPORT.position) / 1000;
}

/**
 * LIKELY ARRIVALS: A ROUGH GUESS, NOT REAL FLIGHT DATA.
 *
 * OpenSky's live positions don't say where a flight is going. So we guess:
 * a plane that is
 *   1. within 60 km of Muscat airport,
 *   2. below 10,000 ft, and
 *   3. descending
 * is probably about to land at Muscat. Airliners usually start descending
 * 150–200 km out, and are below 10,000 ft only in the last few minutes
 * before landing, so this catches most real arrivals.
 *
 * It can be wrong, for example:
 *   - a plane descending towards a different airfield nearby,
 *   - a training flight practising approaches without landing,
 *   - an arrival that is briefly level (pilots often level off while waiting
 *     for clearance to descend further), which drops out of the list.
 *
 * The time estimate assumes the plane flies in a straight line to the airport
 * at its current ground speed:  time = distance ÷ speed.
 * Real arrivals follow set approach routes that line them up with the runway,
 * slow down as they get closer, and sometimes circle in holding patterns, so
 * the real time is usually LONGER than this estimate.
 *
 * Returns { distanceKm, minutes } for a likely arrival, or null otherwise.
 * (minutes is null if the speed is unknown.)
 */
export function getArrivalEstimate(plane) {
  if (plane.onGround) {
    return null; // already landed (or waiting to take off)
  }

  const altitudeMetres = plane.baroAltitude ?? plane.geoAltitude;
  if (altitudeMetres === null) {
    return null;
  }
  const isLow = Math.round(metresToFeet(altitudeMetres)) < ARRIVAL_MAX_ALTITUDE_FEET;
  const isDescending = describeVerticalRate(plane.verticalRate).trend === 'descend';
  const distanceKm = distanceToAirportKm(plane);
  const isClose = distanceKm <= ARRIVAL_MAX_DISTANCE_KM;

  if (!isLow || !isDescending || !isClose) {
    return null;
  }

  // time (s) = distance (m) ÷ speed (m/s); then ÷ 60 for minutes.
  const minutes = plane.velocity > 0 ? (distanceKm * 1000) / plane.velocity / 60 : null;
  return { distanceKm, minutes };
}

/**
 * Work out everything the panel and airport label need, in one go:
 *   arrivals:    [{ plane, estimate }], soonest first
 *   nearbyCount: how many planes are within 30 km of the airport
 */
export function summariseAirspace(planes) {
  const arrivals = planes
    .map((plane) => ({ plane, estimate: getArrivalEstimate(plane) }))
    .filter((arrival) => arrival.estimate !== null)
    .sort((a, b) => (a.estimate.minutes ?? Infinity) - (b.estimate.minutes ?? Infinity));

  const nearbyCount = planes.filter((plane) => distanceToAirportKm(plane) <= NEARBY_RADIUS_KM).length;

  return { arrivals, nearbyCount };
}
