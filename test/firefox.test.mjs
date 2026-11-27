// Firefox/ scripts: the manifest overrides, the identity redirect URLs and the AMO packages.
//   node --test "Firefox/test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_COLLECTION, GECKO_ID, GECKO_MIN_VERSION, OVERRIDES, firefoxRedirectUrls, toFirefoxManifest } from '../scripts/firefox-manifest.mjs';
import { SOURCE_MEMBERS, buildFirefox, buildingNotes, sourceFiles, sourceWorkspaceToml } from '../scripts/package.mjs';
import { WASM_FILES } from '../../Extension/scripts/package.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const firefox = path.resolve(here, '..');
const repo = path.resolve(firefox, '..');
const chrome = JSON.parse(readFileSync(path.join(repo, 'Extension', 'manifest.json'), 'utf8'));

function unzip(buf) {
  const files = new Map();
  let at = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(at + 10);
  let p = buf.readUInt32LE(at + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtra = buf.readUInt16LE(local + 28);
    const body = buf.subarray(local + 30 + lNameLen + lExtra, local + 30 + lNameLen + lExtra + size);
    files.set(name, method === 8 ? inflateRawSync(body) : body);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

test('the Firefox manifest: event page module, gecko id, minimum 140, data consent, no Chrome-only keys', () => {
  const ff = toFirefoxManifest(chrome);
  assert.deepEqual(ff.background, { scripts: [chrome.background.service_worker], type: 'module' });
  assert.equal(ff.browser_specific_settings.gecko.id, 'pass@sensyble.com');
  assert.equal(GECKO_ID, 'pass@sensyble.com', 'the native host allows exactly this id (FIREFOX_EXTENSION_ID)');
  assert.equal(GECKO_MIN_VERSION, '140.0', 'built-in data consent (140), storage.session (115), MAIN-world scripts (128)');
  assert.deepEqual(DATA_COLLECTION.required, ['none'], 'nothing leaves the browser by default');
  assert.deepEqual(DATA_COLLECTION.optional, ['authenticationInfo', 'personallyIdentifyingInfo', 'financialAndPaymentInfo']);
  assert.equal(ff.browser_specific_settings.gecko_android.strict_min_version, '142.0');
  for (const key of OVERRIDES.remove_keys) assert.equal(ff[key], undefined, key);
  assert.ok(!ff.permissions.includes('offscreen'));
  for (const p of ['nativeMessaging', 'storage', 'identity', 'idle', 'unlimitedStorage', 'privacy']) assert.ok(ff.permissions.includes(p), p);
  assert.match(ff.content_security_policy.extension_pages, /'wasm-unsafe-eval'/);
  assert.deepEqual(ff.content_scripts, chrome.content_scripts);
  assert.equal(chrome.background.service_worker, 'src/background.js', 'the shared manifest is untouched');
});

test('the keyboard shortcuts pass through as they are, also commands without a key (the user records one in Options)', () => {
  const commands = {
    _execute_action: { suggested_key: { default: 'Alt+Shift+P', mac: 'MacCtrl+Shift+P' }, description: '__MSG_cmdOpenPopup__' },
    'scan-qr': { suggested_key: { default: 'Alt+Shift+Q', mac: 'MacCtrl+Shift+Q' }, description: '__MSG_cmdScanQr__' },
    lock: { description: '__MSG_cmdLock__' },
  };
  const ff = toFirefoxManifest({ ...chrome, commands });
  assert.deepEqual(ff.commands, commands);
  assert.deepEqual(toFirefoxManifest(chrome).commands, chrome.commands);
});

test('the identity redirect URLs: SHA-1 of the add-on id, as Firefox computes them', () => {
  const { web, loopback } = firefoxRedirectUrls();
  assert.equal(web, 'https://a616c7e5d8c971387d4568e8f94bdd4e9fe1b085.extensions.allizom.org/');
  assert.equal(loopback, 'http://127.0.0.1/mozoauth2/a616c7e5d8c971387d4568e8f94bdd4e9fe1b085');
  const readme = readFileSync(path.join(firefox, 'README.md'), 'utf8');
  assert.ok(readme.includes(web) && readme.includes(loopback), 'README.md lists both for the OAuth clients');
});

test('the source zip workspace: only the crates the WebAssembly needs', () => {
  const toml = sourceWorkspaceToml(readFileSync(path.join(repo, 'Core', 'Cargo.toml'), 'utf8'));
  assert.match(toml, new RegExp(`members = \\[${SOURCE_MEMBERS.map((m) => `"${m}"`).join(', ').replace(/\//g, '\\/')}\\]`));
  assert.ok(!/default-members/.test(toml));
  assert.match(toml, /\[profile\.wasm-release\]/, 'the profiles stay');
  assert.deepEqual(sourceFiles(['Core/core/src/lib.rs', 'Core/desktop-app/x.rs', 'Core/native-host/src/main.rs', 'Core/wasm/src/lib.rs',
    'Extension/node_modules/a.js', 'Extension/src/a.js', 'Core/Cargo.lock', 'Core/Cargo.toml', 'Server/a.rs', 'Windows/a.rs', 'x.pem',
    'Firefox/LICENSE', 'Firefox/NOTES.md', 'Extension/src/NOTES.md', 'Core/core/TODO.md', 'Firefox/.tooling/settings.json']),
  ['Core/Cargo.lock', 'Core/core/src/lib.rs', 'Core/wasm/src/lib.rs', 'Extension/src/a.js', 'Firefox/LICENSE']);
  const notes = buildingNotes({ rustc: 'rustc 1.0.0', cargo: 'cargo 1.0.0', node: 'v1', wasmBindgen: '0.2.1', version: '9.9.9' });
  assert.match(notes, /wasm-bindgen-cli --version 0\.2\.1 --locked/);
  assert.ok(!notes.includes(EM));
});

const EM = String.fromCharCode(0x2014);

const built = WASM_FILES.every((f) => existsSync(path.join(repo, 'Extension', f)));

test('pass-firefox.zip and the source zip', { skip: built ? false : 'Extension/src/wasm is not built (npm run wasm in Extension/)' }, async () => {
  const { addon, source, manifest } = await buildFirefox();
  const files = unzip(addon);
  assert.deepEqual(JSON.parse(files.get('manifest.json').toString()), manifest);
  for (const f of WASM_FILES) assert.ok(files.has(f), f);
  for (const name of files.keys()) assert.ok(!/^(test|scripts|wasm|node_modules|dist)\//.test(name), name);
  const src = unzip(source);
  assert.ok(src.has('BUILDING.md') && src.has('Core/Cargo.toml') && src.has('Core/Cargo.lock'));
  assert.ok(src.has('Core/wasm/Cargo.toml') && src.has('Core/core/Cargo.toml') && src.has('Core/agent/Cargo.toml'));
  assert.ok(src.has('Firefox/scripts/package.mjs'));
  for (const name of src.keys()) assert.ok(!/^(Android|Server|Windows|Accounts|Admin|Website|Core\/desktop-app|Core\/native-host)\//.test(name), name);
  for (const name of src.keys()) assert.ok(!name.startsWith('Extension/src/wasm/'), 'built files are not source');
  const again = await buildFirefox();
  assert.ok(again.addon.equals(addon), 'reproducible');
});

test('no em dash in Firefox/', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', 'dist', '.cache', '.git'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
  for (const f of walk(firefox)) assert.ok(!readFileSync(f, 'utf8').includes(EM), path.relative(firefox, f));
});
