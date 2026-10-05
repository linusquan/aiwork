# aiwork skills

Two agent skills live in `.agents/skills/`:

- [`patreon-posts`](#patreon-posts) reads the latest posts from a Patreon chat.
- [`qantas-points`](#qantas-points) finds the lowest-points Qantas reward round trip for a set of cities and dates.

Both install with `npx skills add`, and both run from their own skill directory.

## patreon-posts

An agent skill that reads a logged-in Patreon chat and returns the latest posts as JSON, including posts that are only an image. The fetch runs in Playwright’s headless shell, so it does not open the Chrome app or add a Chrome icon to the Dock. Signing in still opens a visible Chrome window.

The skill lives at `.agents/skills/patreon-posts/`.

### Download

Install it from this repository:

```bash
npx skills add linusquan/aiwork --skill patreon-posts
```

That copies the skill into the current project’s `.agents/skills/patreon-posts/`. Add `-g` to install it for every project, under `~/.agents/skills/patreon-posts/`.

Then open that skill directory and install its dependencies once. Google Chrome must already be installed. It is used only for sign-in.

```bash
cd .agents/skills/patreon-posts
npm install
npx playwright install chromium-headless-shell
```

If you used `-g`, `cd` to `~/.agents/skills/patreon-posts` instead.

### Use

In an agent that loads `.agents/skills/`, ask for the latest posts and include the chat URL:

```text
last 10 posts https://www.patreon.com/messages/<id>?mode=user&tab=chats
```

Or run the scripts yourself. Every command below runs in the skill directory, the folder that contains `SKILL.md`.

#### First setup

The skill does not assume a Chrome profile path. The first time, pick a directory. `~/.playwright-profile` is the usual choice.

```bash
node scripts/profile.js set ~/.playwright-profile
node scripts/open-chrome.js
```

Sign in to Patreon in the window that opens, then close it. The script does not ask for your password. Later runs reuse that directory. The chosen path is saved in `~/.config/patreon-posts/settings.json`.

To forget the saved path and choose again:

```bash
node scripts/profile.js reset
```

That does not delete the profile directory.

#### Fetch

```bash
node scripts/fetch-patreon-chat.js "https://www.patreon.com/messages/<id>?mode=user&tab=chats" --limit 10
```

`--limit` defaults to 10. It counts posts that have text or at least one image. The JSON lists the oldest post in the window first. Each post has `created_at`, `author`, `text`, and `images`.

If the script says Patreon is not logged in, run `node scripts/open-chrome.js` again, sign in, close the window, and retry. If it says the profile is already in use, close the other Chrome or Playwright window that has that profile.

For one run only, you can point at a different directory without changing the saved path:

```bash
PLAYWRIGHT_USER_DATA_DIR=~/.playwright-profile node scripts/fetch-patreon-chat.js "<url>" --limit 10
```

## qantas-points

Finds a round trip on Qantas Classic Reward seats that costs the fewest points. It reads the public [Qantas Flight Reward finder](https://flightrewardfinder.qantas.com/), keeps direct flights operated by Qantas, and pairs an outbound flight with a return a set number of days later.

It answers questions like: *two people, from Sydney (or Melbourne or Brisbane if Sydney has nothing), to Tokyo or Osaka, for a week, sometime in mid-September 2027.*

The skill lives at `.agents/skills/qantas-points/`.

### What it does and does not do

- **Lowest points first.** Every result is sorted by points per person. Qantas-operated flights are usually the cheapest Classic Reward seats, so partner airlines such as Japan Airlines are dropped.
- **Economy Classic Rewards, direct flights only.** Connections and Classic Plus fares are not included.
- **Seats for everyone.** A flight is kept only when the finder shows at least as many seats as there are people.
- **It quotes, it does not book.** Availability is not held until you book on [qantas.com](https://www.qantas.com/). Book soon after a search, because seats change.
- **No Qantas sign-in.** The finder is public. The skill never asks for a password or membership number.

### Requirements

- Node.js.
- Google Chrome, installed in the usual place. If it is somewhere else, set `CHROME_PATH` to the Chrome executable.

### Download

```bash
npx skills add linusquan/aiwork --skill qantas-points
cd .agents/skills/qantas-points
npm install
```

Add `-g` to `npx skills add` to install it for every project, then `cd ~/.agents/skills/qantas-points` instead.

### First setup

Pick a Chrome profile directory for the skill. It is separate from your everyday Chrome profile, so your bookmarks, history, and logins are not touched. `~/.qantas-playwright-profile` is the usual choice.

```bash
node scripts/profile.js set ~/.qantas-playwright-profile
```

The path is saved in `~/.config/qantas-points/settings.json`. To choose again later, run `node scripts/profile.js reset`. That forgets the path but does not delete the directory.

### Ask an agent

In an agent that loads `.agents/skills/`, describe the trip in plain words:

```text
Find Qantas points flights for 2 people, Sydney to Tokyo, 7-day trip,
leaving and returning between 10 and 20 September 2027.
If Sydney has nothing, try Melbourne then Brisbane. Osaka is fine too.
```

The agent needs five answers. It asks for any you leave out:

| Answer | Example | What it controls |
|---|---|---|
| People | 2 | Each flight must show at least this many seats. |
| Departure cities, in order | Sydney, then Melbourne, then Brisbane | The next city is tried only if the earlier one has no Qantas round trip. |
| Destinations | Tokyo, Osaka | Any city is allowed. The return uses the same airport as the outbound flight. |
| Date ranges | 10–20 September 2027 | One or more ranges. The going date and the return date both have to fall inside them. |
| Trip length | 7 days | The return flight leaves this many days after the outbound flight. |

The search runs in the background and takes several minutes. The agent then reports the cheapest trip, with dates, flight times, points per person, taxes, and the number of seats shown.

### Run it yourself

Every command runs in the skill directory, the folder that contains `SKILL.md`.

```bash
node scripts/find-flights.js \
  --people 2 \
  --from Sydney,Melbourne,Brisbane \
  --to Tokyo,Osaka \
  --days 7 \
  --range 2027-09-10:2027-09-20
```

- `--from` and `--to` are comma-separated, in preference order.
- Repeat `--range YYYY-MM-DD:YYYY-MM-DD` for each extra window, for example a second week in October.
- City names come from `scripts/airports.json`. Tokyo searches Haneda (`HND`), then Narita (`NRT`).

### Cities and airport codes

`scripts/airports.json` lists the Australian departure cities (Sydney, Melbourne, Brisbane, Perth, Adelaide, Canberra, Gold Coast, Cairns, Darwin, Hobart) and popular Asian destinations across Japan, Korea, Greater China, Southeast Asia, and South Asia.

For any other city, pass IATA airport codes instead, for example `--to LHR,LGW` for London. An agent looks the codes up for you and says which ones it searched. A city name that is not in the file stops the search with a message to use codes.

Each airport adds several page loads, so list only airports you would actually fly from or to.

### Results

The script prints JSON:

```json
{
  "people": 2,
  "tripDays": 7,
  "usedOrigin": "SYD",
  "blocked": "",
  "trips": [
    {
      "pointsEach": 72400,
      "outbound": { "date": "2027-09-10", "schedule": "11:15 – 20:10 9 hours 55 mins", "points": 36200, "tax": "AU$184", "seats": "5+", "link": "https://flightrewardfinder.qantas.com/?pg=1&d=HND&o=SYD&dr=2027-09-10I2027-09-20&p=2" },
      "return":   { "date": "2027-09-17", "schedule": "22:00 – 08:55+ 1 9 hours 55 mins", "points": 36200, "tax": "JP¥17,830", "seats": "5+", "link": "..." }
    }
  ]
}
```

- `pointsEach` is the round trip, per person. Multiply by `people` for the total.
- `usedOrigin` is the departure airport that had a result. An empty `trips` list means none of the departure cities had a Qantas round trip in those dates.
- Each `link` opens that page of the finder, so you can check it in your own browser before booking.

### How it runs

```text
find-flights.js
  1. starts Google Chrome normally, with the skill's own profile
  2. attaches to it on 127.0.0.1 (only this Mac can connect)
  3. clears the finder's Cloudflare cookies
  4. opens each finder link, waiting 20–40 seconds between pages
  5. keeps direct Qantas flights with enough seats
  6. pairs outbound and return flights, cheapest first
  7. closes that Chrome and prints JSON
```

A Chrome window appears while it runs. Leave it alone until the search finishes, and it closes itself.

### Cloudflare blocks

The finder sits behind Cloudflare, which blocks browsers that look automated. That is why the skill starts Chrome as a normal app instead of letting Playwright launch it, never runs headless, and opens pages slowly.

If a page is still blocked, the script clears the finder's cookies, waits 2 minutes, and tries that page once more. If it is still blocked, the search stops and `blocked` explains which page. Wait a while before searching again. Retrying immediately makes a block last longer.

If the profile stays blocked, open the skill's profile in Chrome and delete the site data for `flightrewardfinder.qantas.com` and `qantas-millionpointsplus.com`:

```bash
open -na "Google Chrome" --args --user-data-dir="$HOME/.qantas-playwright-profile" "chrome://settings/content/all?searchSubpage=flightrewardfinder"
```

Close that window before the next search, because only one Chrome can use the profile at a time. If the script says the profile is already in use, close the other window that has it open.

## Publish updates

Push changes to `main` on GitHub. Someone who already installed a skill updates it with:

```bash
npx skills update patreon-posts
npx skills update qantas-points
```

`npx skills check` shows whether an update is available. The updater copies the skill files and does not run `npm install`. If `package.json` changed, run `npm install` again in that skill directory.
