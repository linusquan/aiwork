#!/usr/bin/env node
/**
 * Find Qantas Classic Reward round trips from the Flight Reward finder.
 *
 * Opens a visible Chrome window with the sandbox on and reads the result
 * table from a direct link. It does not submit the search form.
 *
 *   node find-flights.js \
 *     --people 2 \
 *     --from SYD,MEL,BNE \
 *     --to HND,NRT,KIX \
 *     --days 7 \
 *     --range 2027-09-10:2027-09-20
 *
 * --from and --to take IATA airport codes, or city names listed in
 * airports.json, in preference order.
 */
const { attachChrome } = require('./chrome');
const { requireProfile } = require('./profile');
const CITY_AIRPORTS = require('./airports.json');

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function usage() {
  console.error(
    'Missing a mandatory answer.\n' +
      'Required:\n' +
      '  --people <n>                 how many people\n' +
      '  --from Sydney,MEL            cities or airport codes to leave from, first is preferred\n' +
      '  --to Tokyo,KIX               cities or airport codes they will fly to\n' +
      '  --days <n>                   return departs this many days after the outbound\n' +
      '  --range YYYY-MM-DD:YYYY-MM-DD   repeat for each window they can travel\n' +
      'Both the going date and the return date must fall inside those windows.'
  );
  process.exit(2);
}

function parseArgs(argv) {
  const from = [];
  const to = [];
  const ranges = [];
  let people = 0;
  let days = 0;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--people') {
      people = Number(next);
      i += 1;
    } else if (arg === '--days') {
      days = Number(next);
      i += 1;
    } else if (arg === '--from') {
      from.push(...String(next || '').split(','));
      i += 1;
    } else if (arg === '--to') {
      to.push(...String(next || '').split(','));
      i += 1;
    } else if (arg === '--range') {
      ranges.push(next);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error('Unknown argument: ' + arg);
      usage();
    }
  }
  const origins = airportCodes(from, '--from');
  const airports = airportCodes(to, '--to');
  const windows = ranges.map(parseRange);
  if (!Number.isInteger(people) || people < 1) usage();
  if (!Number.isInteger(days) || days < 1) usage();
  if (!origins.length || !airports.length || !windows.length) usage();
  return { people, days, origins, airports, windows };
}

function airportCodes(values, flag) {
  const codes = [];
  for (const value of values) {
    const name = String(value || '').trim();
    if (!name) continue;
    let found = CITY_AIRPORTS[name.toLowerCase()];
    if (!found && /^[A-Za-z]{3}$/.test(name)) found = [name.toUpperCase()];
    if (!found) {
      console.error(
        flag + ': "' + name + '" is not in airports.json. Look up its IATA airport codes and pass those instead.'
      );
      process.exit(2);
    }
    for (const code of found) {
      if (!codes.includes(code)) codes.push(code);
    }
  }
  return codes;
}

function parseRange(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})[:/](\d{4}-\d{2}-\d{2})$/);
  if (!match || match[1] > match[2]) {
    console.error('A range must be YYYY-MM-DD:YYYY-MM-DD, start on or before the end: ' + value);
    process.exit(2);
  }
  return { start: match[1], end: match[2] };
}

function inWindows(iso, windows) {
  return windows.some((window) => iso >= window.start && iso <= window.end);
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseDisplayDate(text) {
  const match = String(text || '').match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return '';
  const month = MONTHS[match[2].toLowerCase()] || MONTHS[match[2].toLowerCase().slice(0, 3)];
  if (!month) return '';
  const day = String(match[1]).padStart(2, '0');
  const monthText = String(month).padStart(2, '0');
  return match[3] + '-' + monthText + '-' + day;
}

function parseFare(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw === '—' || raw === '-' || raw === '–') return null;
  const points = raw.match(/([\d,]+)/);
  if (!points) return null;
  const cash = raw.match(/(AU\$|JP¥|A\$)\s*([\d,]+)/);
  const seats = raw.match(/(\d+\+|\d+)\s*seats/i);
  return {
    points: Number(points[1].replace(/,/g, '')),
    tax: cash ? cash[1] + cash[2] : '',
    seats: seats ? seats[1] : '',
  };
}

function seatsEnough(label, people) {
  if (!label) return false;
  const count = parseInt(label, 10);
  if (!Number.isFinite(count)) return false;
  return count >= people;
}

function isDirect(stops) {
  const value = String(stops || '').trim();
  return value === '' || value === '—' || value === '-' || value === '–' || value === '0';
}

function isQantas(carrier) {
  return /qantas/i.test(carrier || '');
}

function finderUrl(origin, dest, window, page, people) {
  return (
    'https://flightrewardfinder.qantas.com/?pg=' +
    page +
    '&d=' +
    dest +
    '&o=' +
    origin +
    '&dr=' +
    window.start +
    'I' +
    window.end +
    '&p=' +
    people
  );
}

const FINDER_COOKIE_DOMAINS = ['flightrewardfinder.qantas.com', 'qantas-millionpointsplus.com'];
const BLOCK_TEXT = /you have been blocked|Attention Required|Just a moment|Verify you are human/i;
const PAGE_GAP_MS = [20000, 40000];
const BLOCK_RETRY_WAIT_MS = 120000;

class BlockedError extends Error {}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageGap() {
  const [min, max] = PAGE_GAP_MS;
  return sleep(min + Math.floor(Math.random() * (max - min)));
}

async function clearFinderCookies(context) {
  const cookies = await context.cookies();
  const domains = new Set(
    cookies
      .map((cookie) => cookie.domain)
      .filter((domain) => FINDER_COOKIE_DOMAINS.some((finder) => domain.replace(/^\./, '').endsWith(finder)))
  );
  for (const domain of domains) await context.clearCookies({ domain });
  if (domains.size) console.error('Cleared finder cookies: ' + [...domains].join(', '));
}

async function readPage(page) {
  await page.waitForFunction(
    (blockSource) =>
      /Page \d+ of \d+|error while searching|Showing \d+ flights/i.test(document.body.innerText) ||
      new RegExp(blockSource, 'i').test(document.title + ' ' + document.body.innerText),
    BLOCK_TEXT.source,
    { timeout: 25000 }
  );
  const text = await page.locator('body').innerText();
  if (BLOCK_TEXT.test((await page.title()) + ' ' + text)) return { blocked: true, pageCount: 0, error: false, rows: [] };
  const pageMatch = text.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  const rows = await page.locator('tr').evaluateAll((trs) =>
    trs.map((tr) => {
      const cells = [...tr.querySelectorAll('td')].map((cell) => cell.innerText.replace(/\s+/g, ' ').trim());
      const carrier = [...tr.querySelectorAll('img')]
        .map((img) => img.alt || img.getAttribute('aria-label') || img.getAttribute('title') || '')
        .filter(Boolean)
        .join(' ');
      return { cells, carrier };
    })
  );
  return {
    pageCount: pageMatch ? Number(pageMatch[2]) : 1,
    error: /error while searching/i.test(text),
    rows: rows.filter((row) => row.cells.length > 5 && !/depart/i.test(row.cells[0])),
  };
}

async function loadFinderPage(page, url) {
  await pageGap();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  let result;
  try {
    result = await readPage(page);
  } catch (err) {
    throw new BlockedError('Finder page did not finish loading: ' + url);
  }
  if (!result.blocked) return result;

  console.error('Cloudflare blocked ' + url + '. Clearing finder cookies and retrying once.');
  await clearFinderCookies(page.context());
  await sleep(BLOCK_RETRY_WAIT_MS);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    result = await readPage(page);
  } catch (err) {
    throw new BlockedError('Finder page did not finish loading: ' + url);
  }
  if (result.blocked) throw new BlockedError('Cloudflare is still blocking the finder: ' + url);
  return result;
}

async function scrapeDirection(page, origin, dest, window, people) {
  const flights = [];
  let pageNo = 1;
  let pageCount = 1;
  while (pageNo <= pageCount && pageNo <= 8) {
    const url = finderUrl(origin, dest, window, pageNo, people);
    console.error('OPEN ' + origin + '-' + dest + ' page ' + pageNo);
    const result = await loadFinderPage(page, url);
    pageCount = result.pageCount;
    if (result.error && result.rows.length === 0) {
      console.error('Finder returned an error for ' + url);
      break;
    }
    for (const row of result.rows) {
      const [dateText, from, to, schedule, stops, economy] = row.cells;
      const date = parseDisplayDate(dateText);
      const fare = parseFare(economy);
      if (!date || !fare || !isDirect(stops) || !isQantas(row.carrier)) continue;
      if (!seatsEnough(fare.seats, people)) continue;
      flights.push({
        date,
        dateText,
        from,
        to,
        schedule,
        carrier: row.carrier,
        points: fare.points,
        tax: fare.tax,
        seats: fare.seats,
        link: url,
      });
    }
    if (!result.pageCount) break;
    pageNo += 1;
  }
  return flights;
}

function pairTrips(outbound, inbound, days, windows) {
  const backByDate = new Map();
  for (const flight of inbound) {
    const list = backByDate.get(flight.date) || [];
    list.push(flight);
    backByDate.set(flight.date, list);
  }
  const trips = [];
  for (const go of outbound) {
    if (!inWindows(go.date, windows)) continue;
    const returnDate = addDays(go.date, days);
    if (!inWindows(returnDate, windows)) continue;
    for (const back of backByDate.get(returnDate) || []) {
      trips.push({
        pointsEach: go.points + back.points,
        outbound: go,
        return: back,
      });
    }
  }
  trips.sort((a, b) => a.pointsEach - b.pointsEach || a.outbound.date.localeCompare(b.outbound.date));
  return trips;
}

async function main() {
  const query = parseArgs(process.argv.slice(2));
  const userDataDir = requireProfile();
  const { context, close } = await attachChrome(userDataDir);

  await clearFinderCookies(context);
  const page = await context.newPage();
  const result = {
    people: query.people,
    tripDays: query.days,
    origins: query.origins,
    airports: query.airports,
    ranges: query.windows,
    usedOrigin: '',
    blocked: '',
    trips: [],
  };

  try {
    for (const origin of query.origins) {
      const trips = [];
      for (const airport of query.airports) {
        const outbound = [];
        const inbound = [];
        for (const window of query.windows) {
          outbound.push(...(await scrapeDirection(page, origin, airport, window, query.people)));
          inbound.push(...(await scrapeDirection(page, airport, origin, window, query.people)));
        }
        trips.push(...pairTrips(outbound, inbound, query.days, query.windows));
      }
      if (trips.length) {
        result.usedOrigin = origin;
        result.trips = trips;
        break;
      }
    }
  } catch (err) {
    if (!(err instanceof BlockedError)) throw err;
    result.blocked = err.message;
  } finally {
    await close();
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
