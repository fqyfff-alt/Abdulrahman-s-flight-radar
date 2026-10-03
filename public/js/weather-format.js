/**
 * weather-format.js — turning the weather data from /api/weather into short,
 * readable text. Used by the status bar strip (and later the weather panel).
 */

/**
 * FLIGHT CATEGORIES
 *
 * A quick way to say how good the weather is for flying, based on two things:
 *   - the CEILING: the height of the lowest cloud layer that covers more than
 *     half the sky (BKN = broken, or OVC = overcast). A few scattered clouds
 *     don't count, because pilots can still see the ground between them.
 *   - the VISIBILITY: how far you can see horizontally.
 * The worse of the two decides the category. (These are the US definitions
 * the Aviation Weather Center uses, so visibility is in statute miles.)
 */
export const FLIGHT_CATEGORIES = {
  VFR: {
    name: 'Visual Flight Rules',
    meaning: 'Good: ceiling above 3,000 ft and visibility over 5 miles (8 km). Pilots can fly by looking outside.',
  },
  MVFR: {
    name: 'Marginal VFR',
    meaning: 'Fair: ceiling 1,000–3,000 ft or visibility 3–5 miles (5–8 km).',
  },
  IFR: {
    name: 'Instrument Flight Rules',
    meaning: 'Poor: ceiling 500–1,000 ft or visibility 1–3 miles (1.6–5 km). Pilots must fly using instruments.',
  },
  LIFR: {
    name: 'Low IFR',
    meaning: 'Very poor: ceiling below 500 ft or visibility under 1 mile (1.6 km).',
  },
};

/** Wind for display: "320° 12kt G20", "VRB 3kt", "Calm", or "—". */
export function formatWind(wind) {
  if (!wind) {
    return '—';
  }
  if (wind.isCalm) {
    return 'Calm';
  }
  // Wind directions are written with three digits, like headings: 010°, 320°.
  const direction = wind.isVariable ? 'VRB' : `${String(wind.directionDeg).padStart(3, '0')}°`;
  const gust = wind.gustKt ? ` G${wind.gustKt}` : ''; // G = gusting to
  return `${direction} ${wind.speedKt}kt${gust}`;
}

/** Wind in words, for screen readers: "from 320 degrees at 12 knots, gusting 20". */
export function describeWindInWords(wind) {
  if (!wind) {
    return 'unknown';
  }
  if (wind.isCalm) {
    return 'calm';
  }
  const from = wind.isVariable ? 'variable' : `from ${wind.directionDeg} degrees`;
  return `${from} at ${wind.speedKt} knots${wind.gustKt ? `, gusting ${wind.gustKt}` : ''}`;
}

/** Visibility for display: "10+ km", "8 km", "1.5 km", or "—". */
export function formatVisibility(visibility) {
  if (!visibility) {
    return '—';
  }
  return `${visibility.km}${visibility.isAtLeast ? '+' : ''} km`;
}

/** Temperature for display: "33°C" or "—". */
export function formatTemperature(celsius) {
  return celsius === null ? '—' : `${Math.round(celsius)}°C`;
}

/** Minutes since a report was observed (Unix seconds), never negative. */
export function minutesSince(unixSeconds) {
  return Math.max(0, Math.floor((Date.now() / 1000 - unixSeconds) / 60));
}

/** A report's age for display: "just now", "12 min ago", "1 h 35 min ago". */
export function formatAge(minutes) {
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`;
}
