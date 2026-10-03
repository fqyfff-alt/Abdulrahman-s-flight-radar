# Muscat Airspace — a live flight radar

A web app that shows real aircraft flying over Muscat, Oman, on a dark
air‑traffic‑control‑style map, using live data from the
[OpenSky Network](https://opensky-network.org/).

It's being built in stages so each part can be tested before the next one starts:

| Stage | What it adds | Status |
| ----- | ------------ | ------ |
| 1 | Test script that fetches the data once and prints a table in the terminal | ✅ done |
| 2 | Backend server with `GET /api/aircraft` (caching, rate‑limit handling) | ✅ done |
| 3 | Basic map with the dark theme, plane markers, and popups | ✅ done |
| 4 | Altitude colours, legend, smooth motion, and trails | ✅ done |
| 5 | Side panel, status bar, airport marker, range rings, arrivals estimate | ⏳ next |
| 6 | Opening animation that draws the country borders | |

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
| `public/js/main.js` | Starting point: creates the map, refreshes aircraft every 30 s |
| `public/js/config.js` | Settings: map centre, zoom levels, tile address, refresh interval |
| `public/js/map.js` | Creates the Leaflet map, tiles, zoom buttons, label toggle |
| `public/js/aircraft.js` | Plane markers: icon, rotation, popups, selection, add/update/remove |
| `public/js/format.js` | Unit conversions (m → ft, m/s → kt, m/s → ft/min), altitude bands, text formatting |
| `public/js/geo.js` | Position maths: moving a point by distance and bearing, dead reckoning, stale positions |
| `public/js/trails.js` | The fading trail behind each plane |
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
│   └── opensky.js        # Talks to OpenSky: login token, fetching, array → object conversion
├── public/
│   ├── index.html        # The web page
│   ├── css/
│   │   └── style.css     # Dark theme (colours as CSS variables)
│   └── js/               # Frontend code, one job per file (see Stage 3)
├── scripts/
│   └── test-fetch.js     # Stage 1: fetch once and print a table
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
| `npm.ps1 cannot be loaded because running scripts is disabled on this system` (Windows) | PowerShell blocks script files by default, and `npm` starts from one. Run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once (answer `Y`), or type `npm.cmd` instead of `npm`. |
| `Cannot find package 'dotenv'` or `'express'` | Run `npm install` first. |
| Map tiles say **"API key required"** | Add your free CARTO key to `.env` as `CARTO_API_KEY=…` (see step 2), then restart the server. The terminal should say `Map tiles: CARTO key set`. |
| Map is completely blank, or no planes appear | Press F12 → Console and look for red errors. If `leaflet.js` failed to load, check your internet connection (Leaflet and the fonts come from the internet). |
| `Port 3000 is already in use` | The server is probably already running in another terminal window. Stop it with Ctrl+C there, or add `PORT=3001` to `.env` and open <http://localhost:3001>. |
| Browser says *can't connect to localhost* | The server isn't running. Start it with `npm start` and keep that terminal open. |
| Very few aircraft | OpenSky's data comes from volunteers' ground receivers, and there are fewer of them around Oman than in Europe. Commercial apps like Flightradar24 have more receivers, so they show more aircraft. |

---

## Data and credits

Flight data © [The OpenSky Network](https://opensky-network.org/), free for research
and non‑commercial use. See the [OpenSky REST API documentation](https://openskynetwork.github.io/opensky-api/rest.html)
for details of every field.
