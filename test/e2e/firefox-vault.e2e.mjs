// Headless Firefox end-to-end test: real Firefox (`npm run firefox`), geckodriver over WebDriver HTTP, a throwaway
// profile and demo data. The add-on is Firefox/dist/unpacked/ plus test-only background modules: native messaging
// answers "host not found", so the real native host is never reached, and a fake Google
// (Extension/test/helpers/fake-drive.js) answers launchWebAuthFlow and Drive and refuses any other network request.
// Both fail closed. Headless Firefox can't click the data consent prompt, so the fake reports it granted.
//   cd Firefox && npm install && npm run firefox && npm run package && npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from '../../../Extension/scripts/package.mjs';
import { firefoxRedirectUrls, GECKO_ID } from '../../scripts/firefox-manifest.mjs';
import { CLIENT_ID } from '../../../Extension/test/helpers/fake-drive.js';

const fakeDriveFile = fileURLToPath(new URL('../../../Extension/test/helpers/fake-drive.js', import.meta.url));

const here = path.dirname(fileURLToPath(import.meta.url));
const firefoxDir = path.resolve(here, '..', '..');
const unpacked = path.join(firefoxDir, 'dist', 'unpacked');
const cache = path.join(firefoxDir, '.cache');
const UUID = '7d3c4b8e-1f2a-4c5d-9e6f-0a1b2c3d4e5f';
const MASTER = 'Demo master password 2026!';

/** Firefox from `npm run firefox` (.cache/firefox/<platform>-<version>/...), or FIREFOX_BINARY. */
function findFirefox() {
  if (process.env.FIREFOX_BINARY) return process.env.FIREFOX_BINARY;
  const root = path.join(cache, 'firefox');
  if (!existsSync(root)) return null;
  for (const d of readdirSync(root).sort().reverse()) {
    for (const rel of ['core/firefox.exe', 'firefox/firefox', 'Firefox.app/Contents/MacOS/firefox', 'Firefox Nightly.app/Contents/MacOS/firefox']) {
      const p = path.join(root, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const binary = findFirefox();
let geckodriver = null;
try { geckodriver = await import('geckodriver'); } catch { /* not installed */ }
const skip = !geckodriver ? 'geckodriver is not installed (npm install in Firefox/)'
  : !binary ? 'Firefox is not fetched (npm run firefox in Firefox/)'
    : !existsSync(path.join(unpacked, 'src', 'wasm', 'pass_wasm_bg.wasm')) ? 'Firefox/dist/unpacked is not built with the WebAssembly (npm run package)'
      : false;

// Test-only background module, loaded before background.js. Fails closed.
const NO_NATIVE_HOST = `
const missing = 'No such native application com.sensyble.pass';
function missingHost(name) {
  const gone = new Set();
  let open = true;
  const port = {
    name,
    onMessage: { addListener() {}, removeListener() {}, hasListener: () => false },
    onDisconnect: { addListener: (f) => gone.add(f), removeListener: (f) => gone.delete(f), hasListener: (f) => gone.has(f) },
    postMessage() {
      if (!open) throw new Error('Attempt to postMessage on disconnected port');
      setTimeout(() => { if (!open) return; open = false; for (const f of gone) f({ ...port, error: { message: missing } }); }, 0);
    },
    disconnect() { open = false; },
  };
  return port;
}
const sendNative = () => Promise.reject(new Error(missing));
for (const api of [globalThis.browser, globalThis.chrome].filter(Boolean)) {
  for (const [key, value] of [['connectNative', missingHost], ['sendNativeMessage', sendNative]]) {
    try { api.runtime[key] = value; } catch { /* read-only */ }
    if (api.runtime[key] !== value) {
      try { Object.defineProperty(api.runtime, key, { value, configurable: true, writable: true }); } catch { /* no */ }
    }
    if (api.runtime[key] !== value) throw new Error('e2e: could not replace runtime.' + key + '; the background does not start');
  }
}
`;

// Test-only background module: a fake Google (sign-in page and Drive) and no other network. Fails closed.
const FAKE_GOOGLE = `
import { fakeGoogle } from './e2e-fake-drive.js';
const api = globalThis.browser;
const google = fakeGoogle({ email: 'demo@example.com' });
globalThis.__e2eGoogle = google;
const realFetch = globalThis.fetch.bind(globalThis);
const own = api.runtime.getURL('');
const fakeFetch = (input, init) => {
  const url = String(input?.url || input);
  if (url.startsWith(own)) return realFetch(input, init);
  if (/^https:\\/\\/(www|oauth2)\\.googleapis\\.com\\//.test(url)) {
    return google.fetch(url, init).catch((err) => { (google.errors ||= []).push(url + ': ' + err); throw err; });
  }
  (google.errors ||= []).push('refused ' + url);
  return Promise.reject(new TypeError('e2e: no network: ' + url));
};
const fakeFlow = async (details) => {
  const keys = Object.keys(details).sort().join(',');
  if (keys !== 'interactive,url' && keys !== 'url') throw new Error('e2e: Firefox refuses these launchWebAuthFlow keys: ' + keys);
  const redirect = new URL(details.url).searchParams.get('redirect_uri');
  if (redirect !== api.identity.getRedirectURL().replace(/^https:\\/\\/([0-9a-f]{40})\\.extensions\\.allizom\\.org\\/$/, 'http://127.0.0.1/mozoauth2/$1')) {
    throw new Error('e2e: Google sign-in without Firefox loopback redirect: ' + redirect);
  }
  const answer = await google.identity.launchWebAuthFlow(details);
  return answer.replace(/^https:\\/\\/[a-p]{32}\\.chromiumapp\\.org\\//, redirect);
};
const consent = async (q) => (q && q.data_collection ? true : realContains(q));
const realContains = api.permissions.contains.bind(api.permissions);
const swaps = [[globalThis, 'fetch', fakeFetch], [api.identity, 'launchWebAuthFlow', fakeFlow], [api.permissions, 'contains', consent]];
for (const [obj, key, value] of swaps) {
  try { obj[key] = value; } catch { /* read-only */ }
  if (obj[key] !== value) { try { Object.defineProperty(obj, key, { value, configurable: true, writable: true }); } catch { /* no */ } }
  if (obj[key] !== value) throw new Error('e2e: could not replace ' + key + '; the background does not start');
}
`;

// Test-only extension page in a frame of the local demo page: WebDriver may not run scripts in extension
// pages, so the demo page posts each request to this frame, which sends it to the background as an
// extension page does and posts the answer back. Only the demo page's origin is answered.
const RELAY_HTML = '<!doctype html><meta charset="utf-8"><script type="module" src="e2e-relay.js"></script>';
const RELAY_JS = `
const allowed = new URLSearchParams(location.search).get('origin');
// A frame in a web page gets only part of the API (no tabs, no identity): those ops go to the test-only
// background module (E2E_OPS) over a port named "e2e".
const port = browser.runtime.connect({ name: 'e2e' });
let seq = 0; const replies = new Map();
port.onMessage.addListener((m) => { const r = replies.get(m.seq); if (r) { replies.delete(m.seq); r(m); } });
const viaBackground = (op, arg) => new Promise((resolve, reject) => {
  const s = ++seq;
  replies.set(s, (m) => (m.thrown ? reject(new Error(m.thrown)) : resolve(m.value)));
  port.postMessage({ seq: s, op, arg });
});
const ops = {
  send: (msg) => browser.runtime.sendMessage(msg),
  manifest: () => browser.runtime.getManifest(),
  redirect: () => viaBackground('redirect'),
  permissions: () => viaBackground('permissions'),
  tab: (url) => viaBackground('tab', url),
  google: () => viaBackground('google'),
};
addEventListener('message', async (e) => {
  if (e.origin !== allowed || !e.data || typeof e.data.n !== 'number' || !ops[e.data.op]) return;
  let value; let thrown = null;
  try { value = await ops[e.data.op](e.data.arg); } catch (err) { thrown = String(err); }
  e.source.postMessage({ n: e.data.n, value, thrown }, allowed);
});
parent.postMessage({ ready: true }, allowed);
`;

// Test-only background module: the relay's ops that need the background's API.
const E2E_OPS = `
const api = globalThis.browser;
const ops = {
  redirect: () => api.identity.getRedirectURL(),
  permissions: () => api.permissions.getAll(),
  google: () => ({ log: globalThis.__e2eGoogle?.log, errors: globalThis.__e2eGoogle?.errors || [] }),
  tab: async (url) => (await api.tabs.query({})).find((t) => t.url === url)?.id ?? null,
};
api.runtime.onConnect.addListener((port) => {
  if (port.name !== 'e2e' || !String(port.sender?.url || '').startsWith(api.runtime.getURL('src/e2e-relay.html'))) return;
  port.onMessage.addListener(async (m) => {
    try { port.postMessage({ seq: m.seq, value: await ops[m.op](m.arg) }); } catch (err) { port.postMessage({ seq: m.seq, thrown: String(err) }); }
  });
});
`;

/** The demo sign-in page with the relay frame. */
function demoPage(origin) {
  const relay = `moz-extension://${UUID}/src/e2e-relay.html?origin=${encodeURIComponent(origin)}`;
  return `<!doctype html><title>Demo sign-in</title>
<form><input name="user" autocomplete="username"><input type="password" name="pw"><button>Sign in</button></form>
<iframe id="relay" src="${relay}"></iframe>
<script>
let n = 0; const waiting = new Map();
window.relayReady = new Promise((r) => { window.markReady = r; });
addEventListener('message', (e) => {
  if (!e.origin.startsWith('moz-extension://')) return;
  if (e.data && e.data.ready) { window.markReady(); return; }
  const w = waiting.get(e.data && e.data.n); if (!w) return;
  waiting.delete(e.data.n); w(e.data);
});
window.relay = (op, arg) => window.relayReady.then(() => new Promise((r) => {
  const id = ++n; waiting.set(id, r);
  document.getElementById('relay').contentWindow.postMessage({ n: id, op, arg }, '*');
}));
</script>`;
}

let driver; let base = ''; let session = ''; let server; let dir; let pageUrl;

async function wd(method, route, body) {
  const res = await fetch(`${base}/session${session ? `/${session}` : ''}${route}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${route}: ${json?.value?.error} ${json?.value?.message}`);
  return json.value;
}

/** One relay operation (RELAY_JS `ops`) through the demo page. */
async function relay(op, arg) {
  const res = await wd('POST', '/execute/async', {
    script: 'const done = arguments[arguments.length - 1]; window.relay(arguments[0], arguments[1]).then(done, (e) => done({ thrown: String(e) }));',
    args: [op, arg ?? null],
  });
  if (res?.thrown) throw new Error(res.thrown);
  return res?.value;
}

/** A message to the background from an extension page, as the pages send them. */
async function bg(type, payload = {}) {
  const res = await relay('send', { type, ...payload });
  if (res?.ok) return res.result;
  throw Object.assign(new Error(res?.error?.message || 'no response'), { code: res?.error?.code || 'internal' });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 20_000, what = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (err) { last = err; }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}: ${last?.message || JSON.stringify(last)}`);
}

before(async () => {
  if (skip) return;
  dir = mkdtempSync(path.join(tmpdir(), 'passyble-ff-e2e-'));
  // The add-on with the test-only first module.
  const ext = path.join(dir, 'addon');
  cpSync(unpacked, ext, { recursive: true });
  writeFileSync(path.join(ext, 'src', 'e2e-no-native-host.js'), NO_NATIVE_HOST);
  writeFileSync(path.join(ext, 'src', 'e2e-ops.js'), E2E_OPS);
  // The helper is written for Node: the two latin1 conversions it does with Buffer, in browser terms.
  const bufferShim = `const Buffer = { from(x, enc) {
  if (typeof x === 'string' && enc === 'latin1') return Uint8Array.from(x, (c) => c.charCodeAt(0));
  const bytes = x instanceof Uint8Array ? x : typeof x === 'string' ? new TextEncoder().encode(x) : new Uint8Array(x.buffer ?? x);
  return { toString: () => Array.from(bytes, (b) => String.fromCharCode(b)).join('') };
} };\n`;
  writeFileSync(path.join(ext, 'src', 'e2e-fake-drive.js'), bufferShim + readFileSync(fakeDriveFile, 'utf8'));
  writeFileSync(path.join(ext, 'src', 'e2e-fake-google.js'), FAKE_GOOGLE);
  writeFileSync(path.join(ext, 'src', 'google-client.json'), JSON.stringify({ client_id: CLIENT_ID }));
  writeFileSync(path.join(ext, 'src', 'e2e-bg.js'),
    "import './e2e-no-native-host.js';\nimport './e2e-fake-google.js';\nimport './e2e-ops.js';\nimport './background.js';\n");
  const manifest = JSON.parse(readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  manifest.background.scripts = ['src/e2e-bg.js'];
  writeFileSync(path.join(ext, 'src', 'e2e-relay.html'), RELAY_HTML);
  writeFileSync(path.join(ext, 'src', 'e2e-relay.js'), RELAY_JS);
  manifest.web_accessible_resources.push({ resources: ['src/e2e-relay.html', 'src/e2e-relay.js'], matches: ['http://127.0.0.1/*'] });
  writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const files = [];
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else files.push({ name: r, data: readFileSync(path.join(abs, e.name)) });
    }
  };
  walk(ext, '');
  const xpi = makeZip(files.sort((a, b) => (a.name < b.name ? -1 : 1)));

  // A local sign-in page to save a login for (demo data).
  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(demoPage(`http://127.0.0.1:${server.address().port}`));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  pageUrl = `http://127.0.0.1:${server.address().port}/login`;

  process.env.GECKODRIVER_CACHE_DIR = cache;
  const port = 4444 + Math.floor(Math.random() * 1000);
  driver = await geckodriver.start({ port, host: '127.0.0.1', log: 'error' });
  base = `http://127.0.0.1:${port}`;
  await waitFor(async () => (await fetch(`${base}/status`)).ok, { what: 'geckodriver' });
  const created = await wd('POST', '', {
    capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': {
      binary,
      args: ['-headless'],
      prefs: {
        'extensions.webextensions.uuids': JSON.stringify({ [GECKO_ID]: UUID }),
        'browser.shell.checkDefaultBrowser': false,
        'datareporting.policy.dataSubmissionEnabled': false,
        'toolkit.telemetry.enabled': false,
        'app.update.enabled': false,
        'signon.rememberSignons': false,
      },
    } } },
  });
  session = created.sessionId;
  await wd('POST', '/moz/addon/install', { addon: xpi.toString('base64'), temporary: true });
  // The demo page in a tab of its own (the add-on opens its setup guide in another one on install).
  const tab = await wd('POST', '/window/new', { type: 'tab' });
  await wd('POST', '/window', { handle: tab.handle });
  await wd('POST', '/url', { url: pageUrl });
  await waitFor(async () => (await relay('manifest'))?.manifest_version === 3, { what: 'the relay frame' });
});

after(async () => {
  if (session) await wd('DELETE', '').catch(() => {});
  driver?.kill();
  server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('the event page starts; no Passyble app found; the vault in this browser is offered', { skip }, async () => {
  const state = await waitFor(async () => {
    const s = await bg('vault.state');
    return s.host === 'missing' ? s : null;
  }, { what: 'the first run to find no app' });
  assert.equal(state.supported, true, 'WebAssembly and storage.session are there');
  assert.equal(state.mode, null, 'nobody chose yet');
  assert.equal(state.has_vault, false);
  const manifest = await relay('manifest');
  assert.equal(manifest.browser_specific_settings.gecko.id, GECKO_ID);
});

test('identity redirect and data consent are the ones Firefox/README.md lists', { skip }, async () => {
  assert.equal(await relay('redirect'), firefoxRedirectUrls().web);
  const perms = await relay('permissions');
  assert.ok(Array.isArray(perms.data_collection), 'Firefox 140+ data consent');
  assert.deepEqual(perms.data_collection.filter((c) => c !== 'none'), [], 'nothing optional granted by default');
});

test('sign in to Google Drive, create a vault there, save a login, lock and unlock it', { skip }, async () => {
  assert.equal((await bg('vault.state')).drive?.configured, true, 'Google sign-in works in Firefox (loopback redirect)');
  assert.equal((await bg('drive.sign-in')).email, 'demo@example.com');
  assert.deepEqual((await bg('drive.list')).vaults, [], 'nothing in Drive yet');
  await assert.rejects(bg('drive.create', { password: 'short', name: 'Demo' }), (err) => err.code === 'invalid_params');
  const created = await bg('drive.create', { password: MASTER, name: 'Demo' });
  assert.ok(created.vault_id);
  assert.equal(created.synced, true, `uploaded to the fake Drive: ${JSON.stringify(await relay('google'))}`);
  assert.equal((await bg('vault.state')).mode, 'browser');
  const tabId = await waitFor(() => relay('tab', pageUrl), { what: 'the page tab' });
  await bg('popup.edit-save', { tabId, fields: { title: 'Demo', username: 'demo@example.com', password: 'Demo-Pw-2026', urls: [pageUrl] } });
  const found = await bg('popup.find', { url: pageUrl });
  assert.equal(found.items.length, 1);
  await bg('popup.lock');
  assert.equal((await bg('popup.status')).locked, true);
  await assert.rejects(bg('popup.unlock-password', { password: 'wrong one' }), (err) => err.code === 'wrong_password');
  await bg('popup.unlock-password', { password: MASTER });
  assert.equal((await bg('popup.status')).locked, false);
  assert.equal((await bg('popup.find', { url: pageUrl })).items.length, 1);
});

test('sync, sign out of Google, open the vault from Drive again', { skip }, async () => {
  await bg('drive.sync-now');
  const out = await bg('drive.sign-out');
  assert.equal(out.has_vault, false, 'this browser\'s copy is gone once Drive has every change');
  await bg('drive.sign-in');
  const { vaults } = await bg('drive.list');
  assert.equal(vaults.length, 1);
  await assert.rejects(bg('drive.open', { file_id: vaults[0].file_id, name: vaults[0].name, password: 'wrong one' }),
    (err) => err.code === 'wrong_password');
  await bg('drive.open', { file_id: vaults[0].file_id, name: vaults[0].name, password: MASTER });
  assert.equal((await bg('popup.find', { url: pageUrl })).items.length, 1, 'the login came back from Drive');
});
