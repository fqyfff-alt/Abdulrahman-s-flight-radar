# Muscat Airspace — a live flight radar

A web app that shows real aircraft flying over Muscat, Oman, on a dark
air‑traffic‑control‑style map, using live data from the
[OpenSky Network](https://opensky-network.org/).

It's being built in stages so each part can be tested before the next one starts:

| Stage | What it adds | Status |
| ----- | ------------ | ------ |
| 1 | Test script that fetches the data once and prints a table in the terminal | ✅ done |
| 2 | Backend server with `GET /api/aircraft` (caching, rate‑limit handling) | ✅ done |
| 3 | Basic map with the dark theme, plane markers, and popups | ⏳ next |
| 4 | Altitude colours, legend, smooth motion, and trails | |
| 5 | Side panel, status bar, airport marker, range rings, arrivals estimate | |
| 6 | Opening animation that draws the country borders | |

---

## What you need

- **Node.js 18 or newer** (the current LTS version is recommended). Check with `node --version`.
  Download it from <https://nodejs.org/>.
- **An OpenSky account** (free). Optional, but strongly recommended; see below.

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

## 2. Create your `.env` file

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
```

If you leave them empty, the app still works in anonymous mode and prints a warning.

## 3. Install dependencies

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
│   └── index.html        # The web page (a placeholder until Stage 3)
├── scripts/
│   └── test-fetch.js     # Stage 1: fetch once and print a table
├── server.js             # Stage 2: Express server, /api/aircraft with caching
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
| `Port 3000 is already in use` | The server is probably already running in another terminal window. Stop it with Ctrl+C there, or add `PORT=3001` to `.env` and open <http://localhost:3001>. |
| Browser says *can't connect to localhost* | The server isn't running. Start it with `npm start` and keep that terminal open. |
| Very few aircraft | OpenSky's data comes from volunteers' ground receivers, and there are fewer of them around Oman than in Europe. Commercial apps like Flightradar24 have more receivers, so they show more aircraft. |

---

## Data and credits

Flight data © [The OpenSky Network](https://opensky-network.org/), free for research
and non‑commercial use. See the [OpenSky REST API documentation](https://openskynetwork.github.io/opensky-api/rest.html)
for details of every field.
