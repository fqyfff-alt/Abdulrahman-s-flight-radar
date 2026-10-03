# Muscat Airspace — a live flight radar

A web app that shows real aircraft flying over Muscat, Oman, on a dark
air‑traffic‑control‑style map, using live data from the
[OpenSky Network](https://opensky-network.org/).

It was built in stages, each one tested before the next began:

| Stage | What it adds | Status |
| ----- | ------------ | ------ |
| 1 | Test script that fetches the data once and prints a table in the terminal | ✅ done |
| 2 | Backend server with `GET /api/aircraft` (caching, rate‑limit handling) | ✅ done |
| 3 | Basic map with the dark theme, plane markers, and popups | ✅ done |
| 4 | Altitude colours, legend, smooth motion, and trails | ✅ done |
| 5 | Side panel, status bar, airport marker, range rings, arrivals estimate | ✅ done |
| 6 | Opening animation that draws the country borders | ✅ done |

---

## What you need

- **Node.js 18 or newer** (the current LTS version is recommended). Check with `node --version`.
  Download it from <https://nodejs.org/>.
- **An OpenSky account** (free). Optional, but strongly recommended; see below.
- **A CARTO basemaps key** (free) for the dark map tiles; see below.

---

## 1. Get OpenSky API credentials

OpenSky lets anyone use the API without an account, but anonymous users only get
**400 API credits per day**. A free account gets **4,000 per day** (8,000 if you
run your own ADS‑B receiver and feed data to OpenSky).

1. Create a free account at <https://opensky-network.org/> (top‑right, *Login* → *Register*).
2. Log in and open your **Account** page: <https://opensky-network.org/my-opensky/account>.
3. Find the **API Client** section and create a new API client.
4. You'll get a **client ID** and a **client secret** (OpenSky may also offer them as a
   downloadable `credentials.json` file). Treat the secret like a password.

> **Why "client credentials"?** OpenSky uses **OAuth2**, a standard way for *programs*
> (not people) to log in. Our server sends the ID and secret to OpenSky's login server,
> gets back a temporary **access token** (valid for 30 minutes), and attaches that
> token to each API request. The code in `lib/opensky.js` caches the token and fetches
> a new one shortly before it expires.

## 2. Get a free CARTO map key

The dark map background ("Dark Matter") comes from [CARTO](https://carto.com/basemaps).
Since September 2026, CARTO requires a free API key from everyone. Without one, the map
still works, but every tile shows an **"API key required"** watermark.

1. Go to <https://carto.com/basemaps/apikey>.
2. Enter your e‑mail address. CARTO e‑mails you a sign‑in link (no password needed).
3. From the dashboard, copy your key.

Personal, research and teaching projects are free up to 5 million tile requests a month,
far more than this app will ever use.

> **Is it OK that this key is visible in the browser?** Yes. Unlike your OpenSky secret,
> a map‑tile key *has* to be in the browser, because it's part of every tile address.
> We still keep it in `.env` so it isn't uploaded to GitHub. To stop anyone else from
> using up your quota, you can restrict the key to your own websites in CARTO's dashboard.

## 3. Create your `.env` file

The `.env` file holds your secrets. It's listed in `.gitignore`, so git will never
upload it to GitHub.

```bash
# macOS / Linux
cp .env.example .env

# Windows (Command Prompt)
copy .env.example .env
```

Open `.env` in your editor and paste in your values (no quotes or spaces needed):

```ini
OPENSKY_CLIENT_ID=your-client-id-here
OPENSKY_CLIENT_SECRET=your-client-secret-here
CARTO_API_KEY=your-carto-key-here
```

If you leave the OpenSky values empty, the app still works in anonymous mode and prints
a warning. If you leave the CARTO key empty, the map tiles are watermarked.

**Restart the server after every change to `.env`**: it's only read at startup.

## 4. Install dependencies

From the project folder:

```bash
npm install
```

This reads `package.json` and downloads the packages the project uses into
`node_modules/`:

- [`dotenv`](https://www.npmjs.com/package/dotenv) loads `.env` into `process.env`.
- [`express`](https://expressjs.com/) is a small web server framework.

Run `npm install` again whenever you pull new code, in case a stage added a package.

---

## Stage 1: fetch the data once

```bash
npm run test-fetch
```

You should see something like this (real aircraft, so yours will differ):

```text
Fetching aircraft between latitude 22.5–24.5° N and longitude 57–60° E…
Mode: authenticated (OAuth2 token)

┌─────────┬──────────┬──────────┬─────────────────┬──────────┬────────────┬───────────┬───────────┬────────┬────────┬────────┐
│ (index) │ ICAO24   │ Callsign │ Country         │ Alt (ft) │ Speed (kt) │ Track (°) │ V/S (fpm) │ Squawk │ Lat    │ Lon    │
├─────────┼──────────┼──────────┼─────────────────┼──────────┼────────────┼───────────┼───────────┼────────┼────────┼────────┤
│ 0       │ '80169d' │ 'IGO51C' │ 'India'         │ 35000    │ 466        │ 116       │ 0         │ '2170' │ 23.255 │ 57.333 │
│ 1       │ '06a115' │ 'QTR960' │ 'Qatar'         │ 33000    │ 495        │ 116       │ 0         │ '2120' │ 23.196 │ 57.464 │
│ 2       │ '80044c' │ 'AXB545' │ 'India'         │ 21950    │ 362        │ 308       │ -1728     │ '—'    │ 24.443 │ 57.127 │
└─────────┴──────────┴──────────┴─────────────────┴──────────┴────────────┴───────────┴───────────┴────────┴────────┴────────┘

Aircraft with a position: 3
Data time:                06:26:00 UTC (10:26:00 Muscat time)
API credits remaining:    3998
```

How to read it:

- **ICAO24**: the aircraft's ICAO 24‑bit transponder address (its permanent ID).
- **Alt (ft)**: barometric altitude in feet. 35,000 ft is "flight level 350".
- **Speed (kt)**: ground speed in knots (nautical miles per hour).
- **Track (°)**: direction of travel, clockwise from north (90 = east, 270 = west).
- **V/S (fpm)**: vertical speed in feet per minute (negative = descending).
- **Squawk**: the 4‑digit transponder code from air traffic control.

Node's `console.table` puts quotes around text values, which is normal.

---

## Stage 2: the backend server

```bash
npm start
```

The terminal should show:

```text
✈️  Muscat Airspace server running at http://localhost:3000
   Aircraft API:  http://localhost:3000/api/aircraft
   OpenSky mode:  authenticated (4,000 credits/day)
   Press Ctrl+C to stop.
```

Then open these in your browser:

- <http://localhost:3000>: a placeholder page (served from `public/`) that calls the
  API and shows a one‑line summary. Stage 3 replaces it with the map.
- <http://localhost:3000/api/aircraft>: the raw JSON. Firefox and Chrome show it
  nicely formatted (Firefox has a built‑in JSON viewer).

Refresh the JSON page a few times. In the terminal you'll see the cache at work:

```text
[10:32:26] OpenSky: 3 aircraft, 3997 credits left      ← real request (1 credit)
[10:32:31] Served from cache (5 s old)                 ← free
[10:32:47] OpenSky: 3 aircraft, 3996 credits left      ← cache expired after 20 s
```

> **Tip:** `npm run dev` starts the server with `node --watch`, which restarts it
> automatically every time you save a `.js` file. Handy while experimenting. (Each
> restart empties the cache, so the next request costs a credit.)

### What `/api/aircraft` returns

```json
{
  "timestamp": 1791009139,
  "aircraftCount": 3,
  "creditsRemaining": 3997,
  "rateLimited": false,
  "retryAfterSeconds": null,
  "fromCache": false,
  "aircraft": [
    {
      "icao24": "500472",
      "callsign": "T7AVRO",
      "originCountry": "San Marino",
      "timePosition": 1791008871,
      "lastContact": 1791009132,
      "longitude": 57.4465,
      "latitude": 23.5233,
      "baroAltitude": 8808.72,
      "onGround": false,
      "velocity": 184.23,
      "trueTrack": 78.56,
      "verticalRate": 0.65,
      "sensors": null,
      "geoAltitude": 9372.6,
      "squawk": "1722",
      "spi": false,
      "positionSource": 0
    }
  ]
}
```

| Field | Meaning |
| ----- | ------- |
| `timestamp` | When OpenSky says these positions were valid (Unix time, seconds since 1 Jan 1970). |
| `aircraftCount` | How many aircraft are in the list. |
| `creditsRemaining` | OpenSky credits left today (from the `X-Rate-Limit-Remaining` header). |
| `rateLimited` | `true` if OpenSky answered *429 Too Many Requests*. The list is then the **last data we had**, not an error. |
| `retryAfterSeconds` | While rate limited: seconds until the server will ask OpenSky again. |
| `fromCache` | `true` if the answer came from the server's 20‑second memory instead of a new OpenSky request. |
| `aircraft` | One object per aircraft. Units are metres and m/s, exactly as OpenSky sends them. Every field is explained in `parseStateVector()` in `lib/opensky.js`. Aircraft without a position are left out. |

If OpenSky can't be reached at all, the API answers with HTTP **502** and
`{ "error": "…a plain-language explanation…" }`.

There is also `GET /api/config`, which gives the web page the CARTO map key from `.env`:
`{ "cartoApiKey": "…" }` (or `null` if it isn't set).

### How the server saves credits

1. **20‑second cache.** The server remembers OpenSky's last answer. Any request
   within 20 seconds (a page refresh, a second tab, a friend on your Wi‑Fi) gets
   that copy for free.
2. **No duplicate requests.** If several requests arrive at the same moment just
   after the cache expires, only the first one contacts OpenSky; the others wait
   for its answer.
3. **Backing off when rate limited.** After a 429, the server stops contacting
   OpenSky until the wait time OpenSky gave has passed, and keeps serving the last
   data it had with `"rateLimited": true`.

---

## Stage 3: the map

```bash
npm start
```

Open <http://localhost:3000>. You should see:

- A dark map of the Muscat area (the Gulf of Oman on the right).
- A white plane icon for each aircraft, **pointing in its direction of travel**.
- Our own **+ / −** zoom buttons in the top‑right corner.

Things to try:

| Do this | What should happen |
| ------- | ------------------ |
| Click a plane | A dark popup opens: callsign, country, altitude (ft), ground speed (kt), vertical rate (▲ climbing / ▼ descending / — level), heading, squawk. The plane grows and gets a glowing teal ring. |
| Press **Esc**, or click the empty map | The popup closes and the ring disappears. |
| Zoom in to level 9 (one click on **+**) | Callsign labels appear next to the planes. Zoom out and they hide. |
| Press **Tab** a few times, then **Enter** | The zoom buttons and planes can be reached with the keyboard; Enter opens a plane's popup. |
| Wait 30 seconds | Planes jump to their new positions. (Stage 4 makes the movement smooth.) |
| Press **F12**, open **Console** | A line appears every 30 s, e.g. `[10:26:00] 5 aircraft (fresh from OpenSky), 3990 credits left`. |
| Switch to another browser tab for a while | Refreshing pauses (saving credits), and restarts the moment you come back. |

**See it as a phone would:**

- **In your browser:** press F12, then **Ctrl + Shift + M** (Mac: Cmd + Shift + M) to
  switch on the device toolbar, and pick a phone such as "iPhone 14".
- **On your real phone:** connect it to the same Wi‑Fi as your computer. Find your
  computer's address with `ipconfig` (Windows; look for *IPv4 Address*) or
  `ipconfig getifaddr en0` (Mac). Then open `http://THAT-ADDRESS:3000` on the phone,
  e.g. `http://192.168.1.23:3000`. If Windows asks whether to allow Node.js through the
  firewall, allow it on **private** networks.

### How the frontend is organised

The browser loads plain JavaScript files directly: no frameworks and no build step.
`index.html` loads them with `<script type="module">`, which lets them `import` from
each other, just like the server code.

| File | Job |
| ---- | --- |
| `public/index.html` | The page: map container, zoom buttons, and `<script>` tags for Leaflet and our code |
| `public/css/style.css` | The dark theme. All colours are CSS variables at the top |
| `public/js/main.js` | Starting point: creates everything, refreshes aircraft every 30 s and passes the data around |
| `public/js/config.js` | Settings: map centre, zoom levels, tile address, refresh interval |
| `public/js/map.js` | Creates the Leaflet map, tiles, zoom buttons, label toggle |
| `public/js/aircraft.js` | Plane markers: icon, rotation, popups, selection, add/update/remove |
| `public/js/format.js` | Unit conversions (m → ft, m/s → kt, m/s → ft/min), altitude bands, text formatting |
| `public/js/geo.js` | Position maths: moving a point by distance and bearing, dead reckoning, stale positions |
| `public/js/trails.js` | The fading trail behind each plane |
| `public/js/airspace.js` | Distance to Muscat airport, nearby count, likely arrivals and their rough ETA |
| `public/js/airport.js` | The OOMS airport marker, its label, and the radar range rings |
| `public/js/panel.js` | The side panel / phone bottom sheet: lists, tap and swipe, row clicks |
| `public/js/status.js` | The status bar and the "Scanning airspace…" message |
| `public/js/layout.js` | Works out which parts of the map the panels cover, so popups and fly‑to avoid them |
| `public/js/borders.js` | Downloads the country outlines (TopoJSON), picks Oman and its neighbours, draws them as SVG paths |
| `public/js/intro.js` | The opening animation: the line‑drawing timeline, map lock, skip, and fallbacks |
| `public/js/weather-format.js` | Weather text: wind (`320° 12kt G20`), visibility, temperature, report age, flight category meanings |
| `public/js/weather-strip.js` | The weather strip in the status bar |
| `public/js/api.js` | Talks to our server (`/api/config`, `/api/aircraft`) |

---

## Stage 4: colours, smooth motion, and trails

```bash
npm start
```

Open <http://localhost:3000>. What's new:

- **Colours by altitude**, with a key in the bottom‑right corner:
  grey = on the ground, green = below 10,000 ft, amber = 10,000–25,000 ft,
  blue = above 25,000 ft. (White means the altitude is unknown.)
- **Smooth motion.** Planes glide forward every second instead of jumping every 30 s.
  Zoom in to level 10 or 11 to see it clearly.
- **Trails.** A thin line behind each plane in its altitude colour, fading from solid
  to transparent. It grows with each data update (one point every 30 s, up to 10
  points ≈ 5 minutes), so give it a few minutes. A plane that climbs through
  10,000 ft gets a trail that changes from green to amber.
- **Faded planes.** If OpenSky hasn't received a plane's position for over a minute,
  the plane is drawn faded and its popup says how old the position is.

### How smooth motion works (dead reckoning)

Between updates, each plane is moved using **dead reckoning**, the way navigators
worked out their position before GPS:

```text
time since report = now − time of the plane's last position report
distance          = ground speed × time since report
new position      = last position, moved that distance along the track
```

To move a point, split the distance into a north part and an east part:

```text
metres north = distance × cos(track)
metres east  = distance × sin(track)
```

Then convert metres to degrees. One degree of latitude is always about 111 km, but a
degree of longitude shrinks towards the poles (111 km × cos(latitude)), which is about
102 km at Muscat. `movePoint()` in `public/js/geo.js` has the full explanation with a
diagram.

When fresh data arrives, every plane is **corrected** to its newly reported position.
A plane that turned since its last report jumps slightly; one flying straight hardly
moves at all.

### Why some planes are faded or stop moving

OpenSky's data comes from volunteers' ground receivers, and there are few around Oman,
especially over the sea. Often OpenSky goes a minute or more without hearing a plane's
position. The app:

- keeps predicting its position for up to **2 minutes** after the last report, then
  stops (beyond that the plane could have turned anywhere), and
- draws it **faded** after **1 minute**. Air traffic controllers call this a
  *coasting* track: shown, but not to be trusted.

You can change both limits in `public/js/config.js` (`MAX_PREDICTION_SECONDS` and
`STALE_POSITION_SECONDS`).

---

## Stage 5: side panel, status bar, airport, and arrivals

```bash
npm start
```

Open <http://localhost:3000>. What's new:

| Part | What you should see |
| ---- | ------------------- |
| **Status bar** (top) | "Muscat Airspace" with a pulsing green dot, plus the number of aircraft, the time of the data (hover for UTC) and your remaining credits. The dot turns **amber** with a short message if OpenSky rate‑limits you, and **red** with "Connection lost" if the server stops answering. |
| **Side panel** (left) | Every aircraft, highest first: callsign, altitude, speed, and a dot in its altitude colour. Click a row and the map flies to that plane and opens its popup. Click a plane on the map and its row is highlighted with a teal border. Click the panel header to fold it away. |
| **Likely arrivals** | At the top of the panel, when there are any: planes that are probably about to land at Muscat, with a rough time and distance to the airport. Their popups say so too. |
| **Airport** | A teal airport symbol at OOMS (its two runways point the real way, 080°/260°), labelled with how many aircraft are within 30 km. Click it for a summary. |
| **Range rings** | Faint circles at 25, 50 and 100 km around the airport, like a radar screen. |
| **Loading** | "Scanning airspace…" with a spinning radar sweep until the first data arrives. |

**On a phone** (or in the browser's phone view, F12 then Ctrl + Shift + M), the panel is
a **bottom sheet**: tap its header or swipe it up to open the list, swipe down or tap again
to close it. Tapping a plane in the list closes the sheet and flies to the plane.

### How "likely arrivals" works (and why it's only a guess)

OpenSky's live positions don't say where a flight is going, so the app guesses. A plane
counts as a likely arrival if it is:

1. within **60 km** of Muscat airport,
2. below **10,000 ft**, and
3. **descending**.

The time shown is `distance ÷ ground speed`, as if the plane flew straight to the airport
at its current speed. Real arrivals follow set approach routes that line them up with the
runway, slow down as they get closer, and sometimes circle in holding patterns, so the
real time is usually **longer**. The comments in `public/js/airspace.js` go through the
cases where the guess can be wrong.

**Why you may rarely see arrivals:** ADS‑B radio signals travel in straight lines, so a
ground receiver can't hear a low plane that is below its horizon, behind the curve of
the Earth. OpenSky has few receivers near Muscat, so low, landing aircraft are the
hardest for it to hear. High cruising airliners are much easier to pick up.

### Distances: the haversine formula

The distance from each plane to the airport is measured along the Earth's curved surface
with the **haversine formula** (`distanceBetween()` in `public/js/geo.js`):

```text
a        = sin²(Δlat / 2) + cos(lat1) × cos(lat2) × sin²(Δlon / 2)
angle    = 2 × atan2(√a, √(1 − a))      ← the angle between the two points, seen from the Earth's centre
distance = Earth's radius × angle       ← arc length = radius × angle (in radians)
```

---

## Stage 6: the opening animation

```bash
npm start
```

Open <http://localhost:3000> (refresh the page to watch it again). In about 4 seconds:

1. The screen starts dark. **Oman's outline draws itself** in glowing teal, all the way around.
2. Just after it starts, **the neighbours follow** one after another in grey: the UAE,
   Saudi Arabia, Yemen, Qatar, Iran and Pakistan.
3. When the outlines are done, **the map fades in** as the view glides in to Muscat.
4. **The status bar, side panel and aircraft fade in**, and the radar range rings expand
   outwards from the airport.
5. The borders stay: Oman as a thinner, dimmer teal line, the neighbours as faint grey.

Things to try:

| Do this | What should happen |
| ------- | ------------------ |
| Click anywhere or press any key during the animation | It skips straight to the finished map |
| Try to drag or scroll‑zoom during the animation | Nothing: the map is locked until the end |
| Turn on your computer's *reduce motion* setting (Windows: Settings → Accessibility → Visual effects → Animation effects **off**; Mac: System Settings → Accessibility → Display → Reduce motion) | No animation: everything appears straight away |

Aircraft data is fetched while the animation plays, so the planes are ready when it
ends. If they're still loading, you'll see "Scanning airspace…". If the border data can't
be downloaded (or takes more than 3 seconds), the animation is skipped and the map
appears normally.

### How the borders are loaded

The outlines come from the [world-atlas](https://github.com/topojson/world-atlas) package
(`countries-50m.json`, made from Natural Earth data) in **TopoJSON** format. TopoJSON
stores each stretch of border only once, even where two countries share it, which keeps
the file small (about 245 KB to download). The `topojson-client` library's
`topojson.feature()` turns it back into normal GeoJSON for Leaflet.

Countries are picked by their **ISO 3166‑1 numeric code**, a standard number that never
changes (Oman = 512, UAE = 784, Saudi Arabia = 682, Yemen = 887, Qatar = 634,
Iran = 364, Pakistan = 586). Codes are safer to match on than names, which can be spelled
in different ways.

The animation starts zoomed out so the whole of Oman fits on screen. At zoom 8 most of
the country (Salalah is about 800 km south of Muscat) would be out of view, especially
on a phone.

### How the line‑drawing trick works

Every border is an SVG `<path>`. SVG can draw a line as dashes: `stroke-dasharray`
sets the dash pattern and `stroke-dashoffset` slides it along the line.

```text
length = path.getTotalLength()          ← how long the outline is, in pixels

stroke-dasharray:  length               ← ONE dash as long as the whole outline, then an equal gap
stroke-dashoffset: length → 0           ← start with the gap over the line (invisible),
                                          slide until the dash covers it (fully drawn)
```

The slide is animated with the Web Animations API (`path.animate(...)`) using
`ease-in-out` timing, so each line starts slowly, speeds up, and settles. Afterwards the
dash settings are removed: Leaflet redraws the paths whenever you zoom, and dash
settings measured for the old length would chop the new lines into pieces. See
`drawOutline()` in `public/js/intro.js`.

---

## Live weather for Muscat airport (OOMS)

The app is getting live aviation weather for Muscat International Airport, built in
stages like the rest of the project:

| Stage | What it adds | Status |
| ----- | ------------ | ------ |
| W1 | Test script that fetches the METAR and TAF once and prints them | ✅ done |
| W2 | `GET /api/weather` on the server (cleaned data, 10‑minute cache) | ✅ done |
| W3 | Weather strip in the status bar | ✅ done |
| W4 | Weather panel with a METAR explainer | ⏳ next |
| W5 | Wind arrow, likely runway in use, and crosswind on the map | |
| W6 | Weather alerts | |

### Where the data comes from

The [Aviation Weather Center](https://aviationweather.gov/data/api/) (part of the US
National Weather Service) publishes weather reports for airports worldwide, free and
without an API key:

- **METAR**: the *current* weather measured at the airport, issued every 30–60 minutes
  (plus extra "SPECI" reports when the weather changes suddenly).
  <https://aviationweather.gov/api/data/metar?ids=OOMS&format=json>
- **TAF** (Terminal Aerodrome Forecast): the *forecast* for the airport for the next
  24–30 hours. <https://aviationweather.gov/api/data/taf?ids=OOMS&format=json>

Each request sends a `User-Agent` header naming this app, as the AWC asks.

### Weather stage W1: print the raw reports

```bash
npm run test-weather
```

You should see the raw METAR line (for example
`METAR OOMS 030750Z 01007KT 9999 FEW030 33/28 Q1015 NOSIG`), a table of every field in
the METAR with its value and meaning, the raw TAF, and a table of its forecast periods.
Add `-- --json` to also print the complete responses:

```bash
npm run test-weather -- --json
```

Things worth noticing in the real data (the later stages handle all of them):

| What | Detail |
| ---- | ------ |
| Missing fields | `wgst` (gusts) and `wxString` (weather like haze or rain) are **left out completely** when there's nothing to report, not set to `null`. |
| Visibility units | `visib` is in **statute miles**, and can be text: `"6+"` means 6 miles or more. The raw METAR uses metres (`9999` = 10 km or more), which is what Oman uses. |
| Wind | `wdir` is a number, or `"VRB"` when the wind direction is variable. `wspd` is always knots, even where the airport reports metres per second. |
| Pressure | `altim` is in hPa (matches `Q1015` in the raw text). |
| No clouds | `clouds` is an empty list, with `cover` set to `"CLR"` or `"CAVOK"`. |
| No report | The API answers **HTTP 204** (no content, empty body) if an airport has no report. |

### Weather stage W2: the `/api/weather` endpoint

```bash
npm start
```

Open <http://localhost:3000/api/weather>. The terminal logs one line each time the
server fetches fresh weather, for example:

```text
[12:24:51] Weather: METAR 07:50 UTC, VFR, wind 010° 7 kt, 33°C
```

Refresh the page: no new log line appears for 10 minutes, because the answer comes from
the cache (`"fromCache": true`). METARs only change every 30–60 minutes, so there's no
point asking more often.

What it returns (shortened):

```json
{
  "station": "OOMS",
  "metar": {
    "raw": "METAR OOMS 030750Z 01007KT 9999 FEW030 33/28 Q1015 NOSIG",
    "observedAt": 1791013800,
    "flightCategory": "VFR",
    "wind": { "directionDeg": 10, "speedKt": 7, "gustKt": null, "isCalm": false, "isVariable": false,
              "variableFromDeg": null, "variableToDeg": null },
    "visibility": { "km": 10, "isAtLeast": true },
    "temperatureC": 33, "dewPointC": 28, "pressureHpa": 1015,
    "clouds": [{ "cover": "FEW", "baseFt": 3000, "type": null }],
    "cavok": false,
    "weather": []
  },
  "taf": {
    "raw": "TAF OOMS 030500Z 0306/0412 02014KT 8000 SCT020 BECMG 0316/0318 24008KT …",
    "issuedAt": 1791003600, "validFrom": 1791007200, "validTo": 1791115200,
    "periods": [{ "from": 1791007200, "to": 1791043200, "change": null, "wind": { … },
                  "visibility": { "km": 8, "isAtLeast": false }, "clouds": [ … ], "weather": [] }, …]
  },
  "fetchedAt": 1791015891,
  "stale": false,
  "fromCache": false
}
```

| Field | Meaning |
| ----- | ------- |
| `wind.directionDeg` | Where the wind blows **from**, in degrees. `null` when the wind is calm or variable. |
| `wind.isCalm` / `wind.isVariable` | Calm = 0 knots. Variable = light wind with no steady direction (`VRB` in the METAR). |
| `wind.gustKt` | Gust speed in knots, or `null` when there are no gusts. |
| `wind.variableFromDeg/ToDeg` | Set when the direction swings between two values (e.g. `200V270`). |
| `visibility.km` / `isAtLeast` | Visibility in km. `isAtLeast: true` means "this or more" (`9999` = 10 km or more). |
| `clouds` | Real cloud layers only, lowest first; `[]` means no significant cloud. `type` is `CB` (thunderstorm cloud), `TCU` (towering cumulus) or `null`. |
| `cavok` | "Ceiling And Visibility OK": 10 km+ visibility, no cloud below 5,000 ft, no significant weather. |
| `weather` | Present‑weather codes such as `HZ` (haze) or `-RA` (light rain). Decoded into words in a later stage. |
| `taf.periods[].change` | `null` = main forecast, `FM` = from, `BECMG` = becoming (gradual change), `TEMPO` = temporarily, `PROB` = a 30–40 % chance. In TEMPO/PROB periods, anything not mentioned (`null` / `[]`) stays the same. |
| `stale` | `true` if the weather service couldn't be reached and this is the last good weather (with `error` saying why). |

If the weather service is down and nothing is cached yet, the endpoint answers
**HTTP 503** with `{ "error": "…", "metar": null, "taf": null }`, so the page can show
"no weather" instead of breaking. After a failure, the server waits 60 seconds before
trying the weather service again.

### Weather stage W3: the weather strip in the status bar

```bash
npm start
```

Open <http://localhost:3000>. After the opening animation, the status bar has a new strip
just left of the aircraft stats:

```text
[VFR] 010° 7kt  33°C  10+ km  updated 41 min ago
```

| Part | Meaning |
| ---- | ------- |
| **Flight category badge** | How good the weather is for flying, from the cloud ceiling and visibility: **VFR** green (good), **MVFR** blue (marginal), **IFR** red (poor, pilots fly by instruments), **LIFR** magenta (very poor). Hover over the strip for the definition. |
| **Wind** | Direction the wind blows **from**, then speed in knots: `320° 12kt G20` = from 320°, 12 knots, gusting 20. `VRB 3kt` = variable direction; `Calm` = no wind. |
| **Temperature** | In °C. |
| **Visibility** | In km; `10+ km` means 10 km or more. |
| **updated X min ago** | Age of the METAR. It turns **amber** if the report is over 90 minutes old, or if the weather service couldn't be reached and the server is showing the last report it had. |

While the first weather is loading the strip says **Fetching weather…**, and if there's no
weather at all it says **Weather unavailable** in amber (hover to see why). The page asks
for new weather every 10 minutes, separately from the 30‑second aircraft refresh.

On phones there's only room for the badge and the wind, so the "Muscat Airspace" title is
hidden from view (screen readers still read it); the live dot stays.

---

## About API credits

Every request to `/api/states/all` costs credits, depending on the size of the area.
Our box around Muscat is 2° × 3° = **6 square degrees**, which costs **1 credit**
(anything up to 25 square degrees costs 1).

Once the web app is running, it asks for fresh data every 30 seconds:

| Account | Credits per day | Requests per hour (every 30 s) | Hours of live tracking per day |
| ------- | --------------- | ------------------------------ | ------------------------------ |
| Anonymous | 400 | 120 | about 3.3 |
| Free account | 4,000 | 120 | about 33 (more than a day) |

Anonymous credits are counted **per IP address**, so on shared Wi‑Fi (school,
university, café) other people's requests can use up the same 400 credits.
The server caches responses so that extra browser tabs don't cost extra credits.

---

## Project structure

```text
.
├── lib/
│   ├── env-check.js      # Explains why credentials weren't found (missing .env, wrong name, …)
│   ├── opensky.js        # Talks to OpenSky: login token, fetching, array → object conversion
│   └── weather.js        # Fetches the METAR and TAF from aviationweather.gov
├── public/
│   ├── index.html        # The web page
│   ├── css/
│   │   └── style.css     # Dark theme (colours as CSS variables)
│   └── js/               # Frontend code, one job per file (see Stage 3)
├── scripts/
│   ├── test-fetch.js     # Stage 1: fetch once and print a table
│   └── test-weather.js   # Weather W1: print the OOMS METAR and TAF
├── server.js             # Express server: /api/aircraft (cached), /api/config, serves public/
├── .env.example          # Template for your secrets (safe to commit)
├── .env                  # Your real secrets (you create this; never committed)
├── .gitignore            # Files git should ignore (node_modules, .env, …)
├── package.json          # Project info, npm scripts, and dependencies
└── README.md
```

---

## Troubleshooting

| Message | What it means / what to do |
| ------- | -------------------------- |
| `No OpenSky credentials found` | Read the **Why:** line under the warning: it names the exact problem (no `.env` file, `.env.txt`, values typed into `.env.example`, empty values, misspelled names, or the wrong file format). After fixing, restart the server: `.env` is only read at startup. |
| `OpenSky login failed (HTTP 401)` | The client ID or secret is wrong. Copy them again from your OpenSky account page. |
| `out of API credits (HTTP 429)` | You've used today's credits. Wait for the time shown, or add credentials to get 10× more. |
| `Could not reach OpenSky` | No internet connection, or a firewall is blocking `opensky-network.org`. |
| `Could not reach aviationweather.gov` | No internet connection, or a firewall is blocking the weather service. |
| `npm.ps1 cannot be loaded because running scripts is disabled on this system` (Windows) | PowerShell blocks script files by default, and `npm` starts from one. Run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once (answer `Y`), or type `npm.cmd` instead of `npm`. |
| `Cannot find package 'dotenv'` or `'express'` | Run `npm install` first. |
| Map tiles say **"API key required"** | Add your free CARTO key to `.env` as `CARTO_API_KEY=…` (see step 2), then restart the server. The terminal should say `Map tiles: CARTO key set`. |
| The opening animation doesn't play | Check whether *reduce motion* is turned on in your system settings (that skips it on purpose). Otherwise press F12 → Console: a yellow "Country borders unavailable" message means the border data couldn't be downloaded. |
| Map is completely blank, or no planes appear | Press F12 → Console and look for red errors. If `leaflet.js` failed to load, check your internet connection (Leaflet and the fonts come from the internet). |
| `Port 3000 is already in use` | The server is probably already running in another terminal window. Stop it with Ctrl+C there, or add `PORT=3001` to `.env` and open <http://localhost:3001>. |
| Browser says *can't connect to localhost* | The server isn't running. Start it with `npm start` and keep that terminal open. |
| Very few aircraft | OpenSky's data comes from volunteers' ground receivers, and there are fewer of them around Oman than in Europe. Commercial apps like Flightradar24 have more receivers, so they show more aircraft. |

---

## Data and credits

Flight data © [The OpenSky Network](https://opensky-network.org/), free for research
and non‑commercial use. See the [OpenSky REST API documentation](https://openskynetwork.github.io/opensky-api/rest.html)
for details of every field.
