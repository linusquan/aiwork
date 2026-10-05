/**
 * Start the installed Google Chrome as a normal process and attach to it.
 *
 * The Flight Reward finder sits behind Cloudflare, which blocks Chrome
 * launched by Playwright. Chrome started this way gets through. It keeps
 * the sandbox on and does not pass test-only flags. Remote debugging is
 * bound to 127.0.0.1, on a free port, for the lifetime of this process.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { chromium } = require('playwright');

const CHROME_PATHS = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const found = (CHROME_PATHS[process.platform] || []).find((candidate) => fs.existsSync(candidate));
  if (!found) {
    console.error('Google Chrome was not found. Install it, or set CHROME_PATH.');
    process.exit(1);
  }
  return found;
}

function profileInUse(userDataDir) {
  let target;
  try {
    target = fs.readlinkSync(userDataDir + '/SingletonLock');
  } catch {
    return false;
  }
  // Chrome writes the lock as a symlink to "<hostname>-<pid>" and can leave it behind after exiting.
  const pid = Number(String(target).split('-').pop());
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function cdpReady(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function exitWhenProfileBusy(userDataDir) {
  if (!profileInUse(userDataDir)) return;
  console.error(
    'Chrome profile is already in use: ' +
      userDataDir +
      '\nClose the other Chrome window that has this profile, then retry.'
  );
  process.exit(1);
}

/** Start Chrome, attach Playwright, and return { context, close }. */
async function attachChrome(userDataDir) {
  exitWhenProfileBusy(userDataDir);
  const port = await freePort();
  const child = spawn(
    findChrome(),
    [
      '--user-data-dir=' + userDataDir,
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=' + port,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  for (let i = 0; i < 30 && !exited; i++) {
    if (await cdpReady(port)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (exited || !(await cdpReady(port))) {
    child.kill();
    console.error('Chrome did not start with remote debugging on 127.0.0.1:' + port + '.');
    process.exit(1);
  }

  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const context = browser.contexts()[0];

  async function close() {
    await browser.close().catch(() => {});
    if (exited) return;
    const done = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (!exited) child.kill('SIGKILL');
  }

  return { context, close };
}

module.exports = { attachChrome };
