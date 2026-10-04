---
name: patreon-posts
description: >-
  Retrieve recent posts from a Patreon chat and summarise them. Use when
  the user shares a patreon.com/messages URL, asks to open or summarise a
  Patreon chat, lounge, or creator chat, or asks for the latest Patreon
  posts. On first setup or reset, ask for a Chrome profile directory and
  save it. On a new machine, or when Patreon is not signed in, open that
  profile and ask the user to sign in. Do not scrape the page or write a
  new Playwright script.
---

# Patreon posts

Patreon chats are Stream Chat. The message list is not reliably in the DOM. The scripts next to this file open Chrome with one persistent profile, read the Stream `channels` response, and print the latest posts as JSON, including image-only posts.

Run every command in the directory that contains this `SKILL.md`. Do not run them from a project root, and do not call `npm run posts`. Do not write another extractor, do not scrape the page, and do not use `npx playwright open`.

## Install

Google Chrome must already be installed. These scripts launch that Chrome. Do not download a browser.

If `node_modules/playwright` is missing in this skill directory, install it once:

```bash
npm install
```

## Profile

Before every fetch, resolve the Chrome profile:

```bash
node scripts/profile.js
```

- `source: env` — `PLAYWRIGHT_USER_DATA_DIR` is set. Use that path for this run.
- `source: saved` — use `userDataDir`. It is stored in `~/.config/patreon-posts/settings.json`.
- `source: unset` — first setup, or a reset. Ask the user for a directory. Suggest `~/.playwright-profile`. Do not choose a path yourself, and do not use `~/.config/mcp/playwright-profile`. After they answer, save it (`~` is fine):

```bash
node scripts/profile.js set "<path>"
```

Use that saved directory on later runs. Do not switch profiles when the directory is missing or sign-in fails.

## Reset

When the user asks to reset the profile location:

```bash
node scripts/profile.js reset
```

This forgets the saved path. It does not delete the Chrome profile directory. Then do first setup again.

The fetch runs headless, so no Chrome window appears. Sign-in stays visible. Chrome launches with the sandbox on, so the `--no-sandbox` warning stays off. Only one process can hold the profile. If a command says the profile is already in use, ask the user to close that Chrome window and retry. If a command says the profile path is not set, do first setup. Do not launch Chrome until a path is saved or `PLAYWRIGHT_USER_DATA_DIR` is set.

## First-time sign-in

Do this after the profile path is resolved, before the first fetch when that directory has no `Default` folder, and whenever the posts script exits with `Patreon is not logged in`.

1. Tell the user the profile path.
2. Open that profile on the Patreon login page and leave the window up:

```bash
node scripts/open-chrome.js
```

This holds the profile until the window is closed.

3. Ask the user to sign in to Patreon in that window, then close it. Do not ask for a password, email, or a code. Do not type credentials.
4. After the window closes, run the posts command below.

## Retrieve

```bash
node scripts/fetch-patreon-chat.js "<patreon-messages-url>" --limit 10
```

- The URL looks like `https://www.patreon.com/messages/<id>?mode=user&tab=chats`.
- `--limit` defaults to 10. It counts posts that have text or at least one image.

The script prints JSON: `channel`, `channelId`, `url`, and `posts` (oldest of the window first). Each post has `created_at`, `author`, `text`, and `images` (URLs). Deleted posts are removed. An image-only post has an empty `text` and one or more `images`. When summarising, open each image URL and describe what it shows.

## Summarise

After the JSON comes back, summarise those posts for the user. Lead with the channel name. Present the newest post first. One short paragraph per post is enough: what was said, not a transcript. Then one line on the overall thread.
