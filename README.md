# Passyble for Firefox

Passyble's browser extension for Firefox (desktop, 140 or later). The extension itself is the shared source in
[`Extension/`](https://github.com/sensyble/PassybleExtension) (one MV3 source for Chrome, Edge, Brave, Firefox and Safari); this folder holds only
what is Firefox's own:

## Repository

Passyble for Firefox: the manifest overrides, AMO packaging and tests around the shared extension.

This is one of the Passyble repositories (Core, Windows, macOS, iOS, Android, Extension, Firefox, Safari, Server, Website). They are cloned side by side into one folder, each under its own name, so the relative paths between them (`../Core/core`, `../../Extension`, ...) work.

Clone next to this one:

* [PassybleExtension](https://github.com/sensyble/PassybleExtension): the shared extension source
* [PassybleCore](https://github.com/sensyble/PassybleCore): the browser vault's WebAssembly and the source zip

```sh
# One folder for all Passyble repositories, for example ~/src/Passyble
mkdir Passyble && cd Passyble
git clone https://github.com/sensyble/PassybleFirefox.git Firefox
git clone https://github.com/sensyble/PassybleExtension.git Extension
git clone https://github.com/sensyble/PassybleCore.git Core
```

Test (from this repository's root):

```sh
npm install && npm test                      # needs ../Extension (with npm install there)
node scripts/package.mjs                     # AMO add-on and source zips (needs ../Extension/src/wasm: npm run wasm in ../Extension)
```

Rust builds run in the sibling Core repository; on Windows run cargo there at idle priority through `..\Core\scripts\cargo-low.cmd` (see CONTRIBUTING.md).


| file | what |
|---|---|
| [`manifest.overrides.json`](manifest.overrides.json) | how the Firefox manifest differs from `Extension/manifest.json` |
| [`scripts/firefox-manifest.mjs`](scripts/firefox-manifest.mjs) | applies the overrides (`toFirefoxManifest`), and the identity redirect URLs |
| [`scripts/package.mjs`](scripts/package.mjs) | builds `pass-firefox.zip`, the AMO source zip and an unpacked copy |
| [`amo/`](amo/) | the addons.mozilla.org listing text (9 languages) and the notes for reviewers |
| [`SIGNING.md`](SIGNING.md) | signing on AMO, listed or self-distributed |
| [`test/`](test/) | unit tests, and a headless Firefox end-to-end test |

`Extension/scripts/package.mjs` still writes `pass-firefox.zip` next to the
Chromium zips; it takes the manifest from here.

## Build

```sh
cd Extension
npm run wasm                              # the browser vault's WebAssembly (Rust), once per change
cd ../Firefox
npm install                               # web-ext, geckodriver, @puppeteer/browsers (dev only)
npm run package                           # dist/pass-firefox.zip, dist/pass-firefox-source.zip, dist/unpacked/
```

To try it: `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on...**, pick
`Firefox/dist/unpacked/manifest.json`. Use a separate Firefox profile for testing (`firefox -P`).

## Test

```sh
cd Firefox
npm test                                  # the scripts (overrides, redirect URLs, packages)
npm run lint                              # web-ext lint of dist/unpacked
npm run firefox                           # fetches Firefox into .cache/ (once)
npm run test:e2e                          # headless Firefox, throwaway profile, demo data
```

The end-to-end test ([`test/e2e/firefox-vault.e2e.mjs`](test/e2e/firefox-vault.e2e.mjs)) installs the built add-on
as a temporary add-on in headless Firefox through geckodriver, with a test-only first background module that makes
native messaging answer "No such native application": a native host registered for Firefox on the test machine (and
the desktop app behind it) is never started. Google is a fake as well (`Extension/test/helpers/fake-drive.js`, the
sign-in page and Drive); every other network request is refused. It checks that the event page starts with the
WebAssembly vault, that the first run finds no app and offers the vault in the browser, signs in to (fake) Google
through Firefox's loopback redirect with only the `launchWebAuthFlow` keys Firefox accepts, creates a vault in
Drive, saves and finds a login for a local demo page, locks, refuses a wrong master password, unlocks, syncs, signs
out of Google (the browser's copy goes), opens the vault from Drive again, and checks the identity redirect URL and
the data consent API. It reports the sync data consent as granted, because headless Firefox can't click Firefox's
prompt (the consent code is unit-tested in `Extension/test/browser-branches.test.js`). Firefox doesn't let WebDriver
run scripts in extension pages, so the demo page talks to the background through a test-only extension frame.

Last run (2026-11-08, Windows 11, Firefox 159.0.1 headless, on integrate/3l after the split): 4 of 4 passed. `web-ext lint`: 0 errors, 2 warnings
(the dynamic `import()` of the content modules in `src/content/bridge.js` and `loader.js`; see the reviewer notes).

## What differs from Chrome

The overrides ([`manifest.overrides.json`](manifest.overrides.json)):

* **Background**: `background.scripts` with `type: "module"` (an event page) instead of a service worker. Firefox
  has no extension service workers. The event page has a DOM, so the clipboard is written and cleared there
  (`src/background/clipboard-clear.js`) and the `offscreen` permission is dropped. Like a service worker it is
  stopped when idle: the vault key waits in `storage.session` and the vault opens again from IndexedDB, as in Chrome.
* **ID**: `pass@sensyble.com`, the `allowed_extensions` entry of the native host manifest
  (`FIREFOX_EXTENSION_ID` in `Core/desktop-app/src-tauri/src/native_messaging.rs`) and the source of the redirect URLs.
* **Minimum version 140**: built-in data consent (140), `storage.session` (115), `"world": "MAIN"` content scripts
  (128). Firefox for Android: 142 in `gecko_android` (its data consent); the add-on isn't offered for Android.
* **Data consent** (required by AMO): `required: ["none"]`, so nothing leaves the browser by default, and optional
  `authenticationInfo`, `personallyIdentifyingInfo`, `financialAndPaymentInfo`. A page asks for them on the click
  that starts sending something from the extension itself (`Extension/src/shared/data-consent.js`): signing in to a
  Passyble account in browser mode asks for the first two; Google Drive (**Continue with Google Drive**, **Move to
  Google Drive**, **Sync now** / **Sign in again**) asks for all three, and the background's Google sign-in
  (`Extension/src/background/local/google.js`) gets no token without them. App mode sends nothing itself (the
  desktop app does the network work) and asks nothing.
* `key` and `minimum_chrome_version` are dropped.

### The vault in this browser

Works in Firefox now, the same as in Chrome: the agent compiled to WebAssembly, loaded by the event page
(`'wasm-unsafe-eval'` in the CSP), the vault file in IndexedDB, the key in `storage.session` while unlocked. The
shared code checks for WebAssembly and `storage.session` instead of the browser's name
(`browserVaultSupported()` in `Extension/src/shared/vault-mode.js`). Firefox keeps `storage.session` away from
content scripts by itself (it has no `setAccessLevel`, and no content script access to that area).

### Google Drive and Passyble account sign-in

Both use `browser.identity.launchWebAuthFlow`. Firefox catches the redirect for this add-on ID at:

| form | URL | used by |
|---|---|---|
| `getRedirectURL()` | `https://a616c7e5d8c971387d4568e8f94bdd4e9fe1b085.extensions.allizom.org/` | the Passyble account (`passyble-extension`) |
| loopback (Firefox 86+) | `http://127.0.0.1/mozoauth2/a616c7e5d8c971387d4568e8f94bdd4e9fe1b085` | Google Drive |

The hash is the SHA-1 of `pass@sensyble.com` (Firefox's `ext-identity.js`); `firefoxRedirectUrls()` computes both.
Google takes redirects only on domains with verified ownership or on loopback addresses, and nobody can verify
allizom.org, so Google Drive uses the loopback form: `webAuthRedirect(ext, { loopback: true })` in
`Extension/src/background/web-auth.js` returns it in Firefox and the `chromiumapp.org` URL in Chromium. A silent
renewal passes only `url` and `interactive` in Firefox (`webAuthFlowDetails()`): Firefox's schema refuses Chrome's
`abortOnLoadForNonInteractive` and `timeoutMsForNonInteractive`.

What the owner has to register (not done yet). The Google OAuth client is the Web application client of project
`pass-511304` (Core/docs/EXTENSION_VAULT.md 6.2); its **Authorized redirect URIs** must list:

| browser | redirect URI | status |
|---|---|---|
| Chrome, Edge, Brave (unpacked, the pinned `key`) | `https://bmjmlhhgfbpcbfbkbndlmmockkbdcaoo.chromiumapp.org/` | the ID in `CHROMIUM_EXTENSION_IDS` |
| Chrome Web Store (and Brave, which installs from it) | `https://<Chrome Web Store ID>.chromiumapp.org/` | ID assigned at first publication |
| Edge Add-ons | `https://<Edge Add-ons ID>.chromiumapp.org/` | ID assigned at first publication |
| Firefox (any channel, add-on ID `pass@sensyble.com`) | `http://127.0.0.1/mozoauth2/a616c7e5d8c971387d4568e8f94bdd4e9fe1b085` | new |

The Passyble account service (client `passyble-extension`) takes `https://<id>.chromiumapp.org/`
for every Chromium ID already; it must also accept Firefox's
`https://a616c7e5d8c971387d4568e8f94bdd4e9fe1b085.extensions.allizom.org/`. Until then a Firefox sign-in in browser
mode ends at the service's redirect error. The Firefox build also needs the Google client id at package time
(`Extension/google-oauth.env`, `npm run google-config`), the same as the Chromium zips; without it Google Drive says
it isn't set up in this build.

## What Firefox can't do

* **Lock when the computer locks**: Firefox's idle API reports only `active` and `idle`, never `locked`. Options
  hides that switch in Firefox; the vault still locks after its time and when the browser closes.
* **Open its shortcuts page from Options**: Firefox has no page an extension may open for that, so Options records
  the keys itself: **Change** on a shortcut's row, then the new keys (`commands.update`; Esc cancels, Backspace
  removes it), and **Reset** for the key Passyble comes with (`commands.reset`). The Add-ons Manager (gear menu,
  Manage Extension Shortcuts) works too. Firefox has no limit of four suggested keys, but the manifest keeps to
  Chrome's: Generate password, New note and Lock come without one.
* **Passkeys in the browser vault**: not in browser mode yet in any browser (a later phase); WebAuthn from
  `moz-extension://` origins is unverified.
* **Native messaging only on desktop**, and only with the Passyble app installed for Firefox (the desktop app
  writes the host manifest and the `HKCU\Software\Mozilla\NativeMessagingHosts` entry). Firefox for Android has no
  native messaging; the add-on isn't offered there.
* **No offscreen documents**: not needed, the event page has a DOM.
* **Host permissions are opt-in** (MV3): the setup guide shows an **Allow access** step when "Access your data for
  all websites" isn't granted.
* **Browser AutoFill settings**: Firefox has only "Ask to save passwords" (`privacy.services.passwordSavingEnabled`),
  no address or card switch for extensions.

Not verified here: Google Drive and account sign-in against the real services (they need the registrations above),
and long-running use of the event page (Firefox may stop it sooner than Chrome stops a service worker; the vault
then opens again from `storage.session` on the next request, which the Chromium tests cover).

## Reporting a security issue

Please don't open a public issue for a vulnerability. How to report one privately, what to include and how
fast we aim to answer are in [SECURITY.md](SECURITY.md), also published at
https://passyble.com/vulnerability-disclosure/.

Dependencies are checked for known vulnerabilities on every push and pull request and every Monday
(`.github/workflows/dependency-audit.yml`: npm audit and osv-scanner), and Dependabot (`.github/dependabot.yml`)
proposes updates weekly.

## Licence

Copyright (C) 2026 Sensyble LLC

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option)
any later version. This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE)
for the full text.

Third-party parts keep their own licences: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Contributions
are welcome under a Contributor License Agreement ([CONTRIBUTING.md](CONTRIBUTING.md)). The Passyble and
Sensyble names and logos are trademarks of Sensyble LLC ([TRADEMARKS.md](TRADEMARKS.md)).
