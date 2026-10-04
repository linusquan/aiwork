#!/usr/bin/env node
/**
 * Fetch recent posts from a Patreon chat (Stream Chat), including image-only posts.
 *
 * Usage:
 *   node scripts/fetch-patreon-chat.js <patreon-messages-url> [--limit 10]
 *
 * Uses PLAYWRIGHT_USER_DATA_DIR, or the directory saved by profile.js.
 * If neither is set, exits and asks for a directory. The profile must
 * not be open in another Chrome or Playwright process.
 */
const { chromium } = require('playwright');
const { requireProfile } = require('./profile');

function usage() {
  console.error('Usage: fetch-patreon-chat.js <https://www.patreon.com/messages/ID> [--limit N]');
  process.exit(2);
}

function parseArgs(argv) {
  let url = '';
  let limit = 10;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') {
      limit = Number(argv[++i]);
      if (!Number.isInteger(limit) || limit < 1) {
        console.error('--limit must be a positive integer');
        process.exit(2);
      }
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else if (!arg.startsWith('-') && !url) {
      url = arg;
    } else {
      console.error('Unknown argument: ' + arg);
      usage();
    }
  }
  if (!url) usage();
  let channelId = '';
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const messagesIdx = parts.indexOf('messages');
    channelId = messagesIdx >= 0 ? parts[messagesIdx + 1] : '';
  } catch {
    console.error('Not a URL: ' + url);
    process.exit(2);
  }
  if (!channelId) {
    console.error('URL must be a Patreon chat: https://www.patreon.com/messages/<id>');
    process.exit(2);
  }
  return { url, channelId, limit };
}

function postsFromPayload(payload, channelId) {
  const found = [];
  for (const item of payload.channels || []) {
    const id = String(item.channel?.id || '');
    if (!id.includes(channelId)) continue;
    const messages = item.messages || [];
    if (!messages.length) continue;
    found.push({
      name: item.channel?.name || '',
      messages,
    });
  }
  return found;
}

async function main() {
  const { url, channelId, limit } = parseArgs(process.argv.slice(2));
  const userDataDir = requireProfile();

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      // No channel: headless selects Playwright's chromium-headless-shell, not Chrome.app.
      headless: true,
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

  const page = await context.newPage();
  const payloads = [];
  page.on('response', async (res) => {
    const responseUrl = res.url();
    if (!responseUrl.includes('chat.stream-io-api.com/channels')) return;
    if (responseUrl.includes('/members') || responseUrl.includes('/query')) return;
    if (res.status() < 200 || res.status() >= 300) return;
    try {
      payloads.push(await res.json());
    } catch {
      // ignore non-JSON
    }
  });

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        break;
      } catch (err) {
        const message = String(err && err.message ? err.message : err);
        if (attempt === 2 || !/ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|ERR_ABORTED/.test(message)) {
          throw err;
        }
      }
    }

    const deadline = Date.now() + 25000;
    let match = null;
    while (Date.now() < deadline) {
      for (const payload of payloads) {
        const hits = postsFromPayload(payload, channelId);
        if (hits.length) match = hits[hits.length - 1];
      }
      if (match) break;
      await page.waitForTimeout(400);
    }

    if (!match) {
      const title = await page.title();
      const href = page.url();
      if (/login|log in|sign up/i.test(title) || /\/login/.test(href)) {
        console.error(
          'Patreon is not logged in.\n' +
            'Profile: ' +
            userDataDir +
            '\nSign in at https://www.patreon.com/login in this profile, then retry.'
        );
      } else {
        console.error(
          'No chat messages found for ' +
            channelId +
            '. Page title: ' +
            title +
            '. The Stream channels response may not have included this chat.'
        );
      }
      process.exit(1);
    }

    const posts = match.messages
      .map((message) => {
        const text = String(message.text || '').trim();
        const images = [];
        for (const attachment of message.attachments || []) {
          const url =
            attachment.image_url ||
            attachment.asset_url ||
            attachment.thumb_url ||
            attachment.url ||
            null;
          const type = attachment.type || '';
          const looksLikeImage =
            type === 'image' ||
            Boolean(attachment.image_url) ||
            /^image\//.test(attachment.mime_type || '') ||
            /\.(png|jpe?g|gif|webp)(\?|$)/i.test(String(url || ''));
          if (looksLikeImage && url) images.push(url);
        }
        for (const media of message.patreon_media || []) {
          const url = media.chat_image_thumbnail || media.image_url || media.url || null;
          if ((media.type === 'image' || url) && url && !images.includes(url)) images.push(url);
        }
        return {
          created_at: message.created_at || null,
          author: message.user?.name || message.user?.id || null,
          text,
          images,
        };
      })
      .filter((post) => post.text !== 'This message was deleted.')
      .filter((post) => post.text || post.images.length);

    const latest = posts.slice(-limit);
    process.stdout.write(
      JSON.stringify(
        {
          channel: match.name,
          channelId,
          url,
          count: latest.length,
          posts: latest,
        },
        null,
        2
      ) + '\n'
    );
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
