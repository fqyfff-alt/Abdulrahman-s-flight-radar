/**
 * taf-summary.js — the TAF (forecast) in plain English, for the next few hours.
 *
 * A TAF is a main forecast followed by changes:
 *   FM    "from":        everything changes completely at a set time
 *   BECMG "becoming":    a gradual, lasting change over an hour or two
 *   TEMPO "temporarily": short spells now and then; the main forecast resumes after
 *   PROB  "probability": a 30% or 40% chance of something happening
 *
 * Example (OOMS):
 *   TAF OOMS 030500Z 0306/0412 02014KT 8000 SCT020 BECMG 0316/0318 24008KT
 *   → "Until 20:00: wind from the north-northeast (020°) at 14 kt, visibility 8 km,
 *      scattered cloud at 2,000 ft."
 *   → "20:00–22:00, becoming: wind from the west-southwest (240°) at 8 kt."
 */

import { capitalize, describeClouds, describeWeather, describeWindDetail } from './weather-decode.js';

/** A Unix time as Muscat local time "20:00", or "tomorrow 10:00". */
function muscatTime(unixSeconds, nowSeconds) {
  const options = { timeZone: 'Asia/Muscat', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  const dateOf = (seconds) => new Date(seconds * 1000).toLocaleDateString('en-GB', { timeZone: 'Asia/Muscat' });
  const time = new Date(unixSeconds * 1000).toLocaleTimeString('en-GB', options);
  if (dateOf(unixSeconds) === dateOf(nowSeconds)) {
    return time;
  }
  const isTomorrow = dateOf(unixSeconds) === dateOf(nowSeconds + 86_400);
  return isTomorrow ? `tomorrow ${time}` : `${new Date(unixSeconds * 1000).toLocaleDateString('en-GB', { timeZone: 'Asia/Muscat', weekday: 'short' })} ${time}`;
}

/** "tomorrow 02:00–05:00": a time range, without repeating the day. */
function timeRange(fromSeconds, toSeconds, now) {
  const from = muscatTime(fromSeconds, now);
  let to = muscatTime(toSeconds, now);
  const day = from.includes(' ') ? from.split(' ')[0] : null; // "tomorrow" or "Sun"
  if (day && to.startsWith(`${day} `)) {
    to = to.slice(day.length + 1);
  }
  return `${from}–${to}`;
}

/** Is this period a temporary one (TEMPO or PROB) that doesn't change the main forecast? */
function isTemporary(period) {
  return period.change === 'TEMPO' || period.change === 'PROB' || period.probability !== null;
}

/** When a period applies, in words. */
function describeWhen(period, now) {
  const range = timeRange(period.from, period.to, now);
  const chance = period.probability ? `${period.probability}% chance ` : '';
  switch (period.change) {
    case 'FM':
      return `From ${muscatTime(period.from, now)}`;
    case 'BECMG':
      return `${timeRange(period.from, period.becomingBy ?? period.to, now)}, becoming`;
    case 'TEMPO':
      return `${capitalize(chance)}${range}, at times`;
    case 'PROB':
      return `${capitalize(chance)}${range}`;
    default:
      return period.from <= now ? `Until ${muscatTime(period.to, now)}` : range;
  }
}

const windKey = (wind) => (wind ? `${wind.directionDeg}/${wind.speedKt}/${wind.gustKt}/${wind.isVariable}` : '');
const visibilityKey = (visibility) => (visibility ? `${visibility.km}/${visibility.isAtLeast}` : '');

/**
 * The conditions in a period, in words. For lasting changes (FM, BECMG) only
 * what differs from `previous` is mentioned; temporary ones (TEMPO, PROB)
 * only list what they include, because anything else stays as it was.
 * `describeAll` is for the weather right now: mention everything.
 */
function describeConditions(period, previous, describeAll = false) {
  const parts = [];
  if (period.wind && windKey(period.wind) !== windKey(previous?.wind)) {
    parts.push(`wind ${describeWindDetail(period.wind)}`);
  }
  if (period.visibility && visibilityKey(period.visibility) !== visibilityKey(previous?.visibility)) {
    parts.push(`visibility ${period.visibility.km}${period.visibility.isAtLeast ? '+' : ''} km`);
  }
  if (period.weather.length > 0 && period.weather.join() !== previous?.weather.join()) {
    parts.push(describeWeather(period.weather));
  }
  const cloudsText = describeClouds(period.clouds).toLowerCase();
  const isMain = period.change === null || describeAll;
  if ((period.clouds.length > 0 || isMain) && cloudsText !== (previous ? describeClouds(previous.clouds).toLowerCase() : '')) {
    parts.push(cloudsText.replace(/\b(few|scattered|broken) at/g, '$1 clouds at'));
  }
  return parts.length > 0 ? `${capitalize(parts.join(', '))}.` : 'No significant change.';
}

/**
 * Summarise the TAF for the next `hoursAhead` hours:
 *   [{ when: "20:00–22:00, becoming", text: "Wind from the southwest (240°) at 8 kt." }, …]
 */
export function summarizeTaf(taf, { now = Date.now() / 1000, hoursAhead = 12 } = {}) {
  const until = now + hoursAhead * 3600;
  const lines = [];
  let prevailing = null; // the "main" conditions that each change builds on

  for (const period of taf.periods) {
    const isRelevant = period.to > now && period.from < until;
    if (isRelevant) {
      // A lasting change that has already finished is simply "the weather now".
      const isCurrent = !isTemporary(period) && (period.becomingBy ?? period.from) <= now;
      lines.push({
        when: isCurrent ? `Until ${muscatTime(period.to, now)}` : describeWhen(period, now),
        text: isCurrent
          ? describeConditions(period, null, true)
          : describeConditions(period, isTemporary(period) ? null : prevailing),
      });
    }
    if (!isTemporary(period)) {
      prevailing = period; // temporary spells don't change the main forecast
    }
  }
  return lines;
}
