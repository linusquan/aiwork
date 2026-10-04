# patreon-posts

An agent skill that reads a logged-in Patreon chat and returns the latest posts as JSON, including posts that are only an image. The fetch runs in Playwright’s headless shell, so it does not open the Chrome app or add a Chrome icon to the Dock. Signing in still opens a visible Chrome window.

The skill lives at `.agents/skills/patreon-posts/`.

## Download

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

## Use

In an agent that loads `.agents/skills/`, ask for the latest posts and include the chat URL:

```text
last 10 posts https://www.patreon.com/messages/<id>?mode=user&tab=chats
```

Or run the scripts yourself. Every command below runs in the skill directory, the folder that contains `SKILL.md`.

### First setup

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

### Fetch

```bash
node scripts/fetch-patreon-chat.js "https://www.patreon.com/messages/<id>?mode=user&tab=chats" --limit 10
```

`--limit` defaults to 10. It counts posts that have text or at least one image. The JSON lists the oldest post in the window first. Each post has `created_at`, `author`, `text`, and `images`.

If the script says Patreon is not logged in, run `node scripts/open-chrome.js` again, sign in, close the window, and retry. If it says the profile is already in use, close the other Chrome or Playwright window that has that profile.

For one run only, you can point at a different directory without changing the saved path:

```bash
PLAYWRIGHT_USER_DATA_DIR=~/.playwright-profile node scripts/fetch-patreon-chat.js "<url>" --limit 10
```

## Publish

Push changes to `main` on GitHub. Someone who already installed the skill updates it with:

```bash
npx skills update patreon-posts
```

`npx skills check` shows whether an update is available. The updater copies the skill files and does not run `npm install`. If `package.json` changed, run `npm install` again in the skill directory.
