---
name: qantas-points
description: >-
  Find low-points Qantas Classic Reward round trips. Use when the user asks
  for Qantas points flights, Classic Flight Rewards, reward seats to a city,
  or the cheapest Qantas points fare in a date window. Ask for the mandatory
  answers before searching. Do not scrape a new site or write a new
  Playwright script.
---

# Qantas points

The search opens the Qantas Flight Reward finder with a direct link, in a visible Chrome window. It starts the installed Google Chrome as a normal process, then attaches over remote debugging on `127.0.0.1`. Cloudflare blocks Chrome launched by Playwright (`launchPersistentContext`) and headless Chrome, and submitting the form returns an error, so do not do any of those. The sandbox stays on, and Chrome gets no test-only flags. The script keeps direct Qantas flights with enough seats, pairs a return exactly `--days` later, and prints the lowest points first.

The finder sits behind Cloudflare. Before each search the script clears the finder's cookies (`flightrewardfinder.qantas.com` and `qantas-millionpointsplus.com`). Cookies for other sites stay. It waits 20–40 seconds between page loads, so a search takes several minutes. Run it in the background. If Cloudflare blocks a page, it clears those cookies, waits 2 minutes, and retries once. If that page is still blocked, it stops the whole search. Do not rerun it in a loop.

Run every command in the directory that contains this `SKILL.md`.

## Mandatory answers

Ask for anything the user has not already given. Do not invent a number, a city, or a date.

1. **People.** How many seats. A flight is kept only when the finder shows at least that many seats.
2. **Departure cities, in order.** The first city is the one to use. Later cities are tried only when the earlier city has no Qantas round trip.
3. **Destinations.** Cities they will accept, in any country. A round trip uses the same airport both ways.
4. **Date ranges.** One or more windows, each with a start date and an end date. The going flight and the return flight both have to fall inside the windows.
5. **Trip length.** How many days later the return flight departs. A 7-day trip that leaves on 10 September returns on 17 September.

## Cities to airport codes

`scripts/airports.json` lists the Australian departure cities and popular Asian destinations, with their airport codes in the order to try. Tokyo is `HND,NRT`, Haneda first. Pass those cities by name, for example `--to Tokyo,Osaka`.

For any city not in that file, look up the international airports that serve it, with a web search if you are not certain, and pass their IATA codes, for example `--to LHR,LGW` for London. Do not guess a code. If the lookup leaves you unsure which airports count, ask the user. Tell the user which codes you searched. Add a city to `airports.json` only when the user asks for it to be kept.

These are fixed rules, not questions. Spend as few Qantas points as possible. Keep Qantas-operated flights and drop partner airlines. Search Classic Reward economy, because that is the low-points fare. A round trip is two one-way finder results. Points on the page are per person.

## Install

If `node_modules/playwright` is missing in this skill directory, install it once with `npm install`. Google Chrome must already be installed. If it is not in the usual place, set `CHROME_PATH` to the Chrome executable.

## Profile

Before every search, resolve the Chrome profile:

```bash
node scripts/profile.js
```

- `source: env` — `PLAYWRIGHT_USER_DATA_DIR` is set. Use that path for this run.
- `source: saved` — use `userDataDir`. It is stored in `~/.config/qantas-points/settings.json`.
- `source: unset` — first setup, or a reset. Ask the user for a directory. Suggest `~/.qantas-playwright-profile`. Do not choose a path yourself. After they answer, save it (`~` is fine):

```bash
node scripts/profile.js set "<path>"
```

Use that saved directory on later runs. Only one process can hold the profile. If a command says the profile is already in use, ask the user to close that Chrome window and retry.

## Reset

When the user asks to reset the profile location:

```bash
node scripts/profile.js reset
```

This forgets the saved path. It does not delete the Chrome profile directory. Then do first setup again.

The finder is public, so the search does not need a Qantas sign-in. Do not ask the user to sign in, and do not ask for a password or membership number.

## Search

```bash
node scripts/find-flights.js \
  --people 2 \
  --from Sydney,Melbourne,Brisbane \
  --to Tokyo \
  --days 7 \
  --range 2027-09-10:2027-09-20
```

Repeat `--range` for each extra window. `--from` and `--to` are comma-separated, and can mix city names from `airports.json` with airport codes. Each code costs several page loads at 20–40 seconds apiece, so add only the airports the user would actually fly.

The script prints JSON: `people`, `tripDays`, `origins`, `airports`, `ranges`, `usedOrigin`, `blocked`, and `trips`. When `blocked` is not empty, the search stopped at a Cloudflare page and the trips are incomplete. Tell the user, and ask before trying again. Each trip has `pointsEach`, `outbound`, and `return`. A flight has `date`, `schedule`, `carrier`, `points`, `tax`, `seats`, and `link`. `pointsEach` is the two flights added, per person. An empty `trips` list means that origin had no Qantas round trip, and the script already tried the later cities.

## Answer

Lead with the lowest-points trip. Name the dates, the flight times, the points per person, and the taxes. Mention how many seats the finder showed. Say the quote is not held until it is booked on qantas.com. If several trips share that points price, list those dates. Do not recommend a partner airline when a Qantas flight is in the result.
