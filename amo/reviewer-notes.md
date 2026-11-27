# Notes for AMO reviewers (paste into "Notes to Reviewer")

Passyble is a password manager. The add-on fills passwords, 2FA codes, cards and addresses, in one of two modes the
user picks in the setup guide:

1. **The Passyble app on this computer**: everything goes over native messaging to `com.sensyble.pass` (the
   desktop app's native host). The add-on keeps no vault.
2. **The vault in this browser**: the vault code (Rust, compiled to WebAssembly: `src/wasm/`) keeps an encrypted
   vault in the add-on's IndexedDB; the key is in `storage.session` only while unlocked.

How to test without the desktop app: install, pick **Create a vault** in the setup guide, set a master password,
save a login on any sign-in page from the "Save login to Passyble?" prompt, then use the field menu to fill it.

Generated code: only `src/wasm/pass_wasm_bg.wasm`, `src/wasm/pass_wasm.js` (wasm-bindgen glue) and
`src/wasm/pass_wasm_kdf.wasm`. The uploaded source zip has the Rust crates and `BUILDING.md` with the exact tool
versions and commands. Every other file is hand-written JavaScript, not minified or bundled.

Network: two kinds of requests, never with vault data. Every few hours the background fetches the public
minimum-version list from https://account.passyble.com/api/app-versions (`src/background/app-versions.js`:
`credentials: "omit"`, no referrer, nothing about the user, device or vault). After the user clicks Sign in
(Passyble account, account.passyble.com) and accepts Firefox's data consent prompt for the optional categories,
the add-on sends the sign-in token. `data_collection_permissions.required` is `["none"]` because the version check
carries no user data. Google Drive sync is done by the desktop app, not the add-on.

Dynamic imports: `src/content/bridge.js` and `src/content/loader.js` call
`import(browser.runtime.getURL('src/content/...'))` with a fixed path inside the add-on (web-ext lint reports
`UNSAFE_VAR_ASSIGNMENT` for that); no remote code is loaded.

Permissions: `nativeMessaging` (the desktop app), `<all_urls>` (filling on every site), `storage`, `scripting`,
`contextMenus`, `clipboardWrite` (copy, then clear after 45 s), `alarms`, `idle`, `identity` (sign-in windows),
`privacy` (offer to turn off Firefox's own password saving), `unlimitedStorage` (the vault in IndexedDB must not be
evicted), `activeTab`.
