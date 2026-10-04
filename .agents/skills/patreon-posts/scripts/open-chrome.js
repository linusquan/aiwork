#!/usr/bin/env node
/**
 * First-time Patreon sign-in for this skill.
 *
 * Opens the saved Chrome profile on the Patreon login page and keeps the
 * window open until it is closed. Same profile as fetch-patreon-chat.js:
 * PLAYWRIGHT_USER_DATA_DIR, or the directory saved by profile.js.
 *
 *   node open-chrome.js [url]
 */
const { chromium } = require('playwright');
const { requireProfile } = require('./profile');

const url = process.argv[2] || 'https://www.patreon.com/login';
const userDataDir = requireProfile();

(async () => {
  console.error('Profile: ' + userDataDir);
  console.error('Sign in to Patreon in the Chrome window, then close it.');

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: false,
      chromiumSandbox: true,
    });
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    if (/existing browser session|profile|SingletonLock|ProcessSingleton/i.test(message)) {
      console.error(
        'Chrome profile is already in use: ' +
          userDataDir +
          '\nClose the other Chrome or Playwright window that has this profile, then retry.'
      );
      process.exit(1);
    }
    throw err;
  }

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url);

  await new Promise((resolve) => context.on('close', resolve));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
