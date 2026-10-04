#!/usr/bin/env node
/**
 * Resolve, save, or forget the Chrome profile directory for this skill.
 *
 *   node profile.js              # print { source, userDataDir }
 *   node profile.js set <path>   # persist a directory (~ is expanded)
 *   node profile.js reset        # forget the saved directory
 *
 * Resolution order:
 *   1. PLAYWRIGHT_USER_DATA_DIR, when set
 *   2. ~/.config/patreon-posts/settings.json
 *   3. unset — ask the user; do not assume a directory
 *
 * Suggested directory for a new setup: ~/.playwright-profile
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsPath = path.join(os.homedir(), '.config', 'patreon-posts', 'settings.json');
const suggestedDir = path.join(os.homedir(), '.playwright-profile');

function expandHome(input) {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function readSaved() {
  let raw;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return '';
    throw err;
  }
  const data = JSON.parse(raw);
  const dir = data && typeof data.userDataDir === 'string' ? data.userDataDir.trim() : '';
  return dir;
}

function resolveProfile() {
  const env = process.env.PLAYWRIGHT_USER_DATA_DIR;
  if (env && env.trim()) {
    return {
      source: 'env',
      userDataDir: path.resolve(expandHome(env.trim())),
      suggestedDir,
      settingsPath,
    };
  }
  const saved = readSaved();
  if (saved) {
    return {
      source: 'saved',
      userDataDir: saved,
      suggestedDir,
      settingsPath,
    };
  }
  return { source: 'unset', userDataDir: '', suggestedDir, settingsPath };
}

function saveProfile(dir) {
  const userDataDir = path.resolve(expandHome(dir.trim()));
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ userDataDir }, null, 2) + '\n');
  return userDataDir;
}

function resetProfile() {
  fs.rmSync(settingsPath, { force: true });
}

function requireProfile() {
  const resolved = resolveProfile();
  if (resolved.source !== 'unset') return resolved.userDataDir;
  const profileScript = path.join(__dirname, 'profile.js');
  console.error(
    'Profile path is not set.\n' +
      'PLAYWRIGHT_USER_DATA_DIR is unset and no saved path exists at ' +
      settingsPath +
      '.\nSuggested directory: ' +
      suggestedDir +
      '\nAsk the user for a directory, then save it with:\n' +
      '  node ' + profileScript + ' set <path>\n' +
      'To forget a saved path:\n' +
      '  node ' + profileScript + ' reset'
  );
  process.exit(2);
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!cmd || cmd === 'status') {
    process.stdout.write(JSON.stringify(resolveProfile(), null, 2) + '\n');
    return;
  }
  if (cmd === 'set') {
    if (!arg || !arg.trim()) {
      console.error('Usage: profile.js set <directory>');
      process.exit(2);
    }
    const userDataDir = saveProfile(arg);
    process.stdout.write(JSON.stringify({ source: 'saved', userDataDir, settingsPath }, null, 2) + '\n');
    return;
  }
  if (cmd === 'reset') {
    resetProfile();
    process.stdout.write(JSON.stringify({ source: 'unset', userDataDir: '', suggestedDir, settingsPath }, null, 2) + '\n');
    return;
  }
  console.error('Usage: profile.js [status|set <directory>|reset]');
  process.exit(2);
}

if (require.main === module) main();

module.exports = { resolveProfile, saveProfile, resetProfile, requireProfile, settingsPath, suggestedDir };
