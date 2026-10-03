# Muscat Airspace — a live flight radar

A web app that shows real aircraft flying over Muscat, Oman, on a dark
air‑traffic‑control‑style map, using live data from the
[OpenSky Network](https://opensky-network.org/).

It's being built in stages so each part can be tested before the next one starts:

| Stage | What it adds | Status |
| ----- | ------------ | ------ |
| 1 | Test script that fetches the data once and prints a table in the terminal | ✅ done |
| 2 | Backend server with `GET /api/aircraft` (caching, rate‑limit handling) | ⏳ next |
| 3 | Basic map with the dark theme, plane markers, and popups | |
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
`node_modules/`. So far that's just [`dotenv`](https://www.npmjs.com/package/dotenv),
which loads `.env` into `process.env`.

---

## Stage 1: fetch the data once

```bash
npm run test-fetch
```

You should see something like this (real aircraft, so yours will differ):

```text
Fetching aircraft between latitude 22.5–24.5° N and longitude 57–60° E…
Mode: authenticated (OAuth2 token)

┌─────────┬──────────┬────────────────────────┬──────────┬────────────┬───────────┬───────────┬────────┬────────┬────────┐
│ (index) │ Callsign │ Country                │ Alt (ft) │ Speed (kt) │ Track (°) │ V/S (fpm) │ Squawk │ Lat    │ Lon    │
├─────────┼──────────┼────────────────────────┼──────────┼────────────┼───────────┼───────────┼────────┼────────┼────────┤
│ 896714  │ 'ETD4UA' │ 'United Arab Emirates' │ 35000    │ 462        │ 70        │ 0         │ '1771' │ 23.54  │ 57.97  │
│ 80044c  │ 'AXB545' │ 'India'                │ 32525    │ 426        │ 324       │ -1600     │ '—'    │ 24.009 │ 57.676 │
└─────────┴──────────┴────────────────────────┴──────────┴────────────┴───────────┴───────────┴────────┴────────┴────────┘

Aircraft with a position: 2
Data time:                06:19:57 UTC (10:19:57 Muscat time)
API credits remaining:    3990
```

How to read it:

- **(index)**: the aircraft's ICAO 24‑bit transponder address (its permanent ID).
- **Alt (ft)**: barometric altitude in feet. 35,000 ft is "flight level 350".
- **Speed (kt)**: ground speed in knots (nautical miles per hour).
- **Track (°)**: direction of travel, clockwise from north (90 = east, 270 = west).
- **V/S (fpm)**: vertical speed in feet per minute (negative = descending).
- **Squawk**: the 4‑digit transponder code from air traffic control.

Node's `console.table` puts quotes around text values, which is normal.

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
The server (Stage 2) caches responses so that extra browser tabs don't cost extra credits.

---

## Project structure

```text
.
├── lib/
│   └── opensky.js        # Talks to OpenSky: login token, fetching, array → object conversion
├── scripts/
│   └── test-fetch.js     # Stage 1: fetch once and print a table
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
| `No OpenSky credentials found` | `.env` is missing or empty. Check that it's named exactly `.env` (not `.env.txt`) and is in the project folder. |
| `OpenSky login failed (HTTP 401)` | The client ID or secret is wrong. Copy them again from your OpenSky account page. |
| `out of API credits (HTTP 429)` | You've used today's credits. Wait for the time shown, or add credentials to get 10× more. |
| `Could not reach OpenSky` | No internet connection, or a firewall is blocking `opensky-network.org`. |
| `Cannot find package 'dotenv'` | Run `npm install` first. |
| Very few aircraft | OpenSky's data comes from volunteers' ground receivers, and there are fewer of them around Oman than in Europe. Commercial apps like Flightradar24 have more receivers, so they show more aircraft. |

---

## Data and credits

Flight data © [The OpenSky Network](https://opensky-network.org/), free for research
and non‑commercial use. See the [OpenSky REST API documentation](https://openskynetwork.github.io/opensky-api/rest.html)
for details of every field.
