# Signing and distributing Passyble for Firefox

Release Firefox (and ESR) installs only add-ons signed by Mozilla. Every signature comes from addons.mozilla.org
(AMO), in one of two channels; there is no self-signing. Firefox Developer Edition and Nightly can turn signing off
(`xpinstall.signatures.required`), release Firefox can't.

| channel | who installs it | review | updates |
|---|---|---|---|
| **listed** (recommended) | anyone, from the AMO listing | automatic checks, then human review (may come after publication) | AMO serves them |
| **unlisted** (self-distributed) | whoever gets the signed `.xpi` from us (website, IT) | automatic checks; human review may follow | our own `update_url` |

Both need the same upload and, because the add-on contains WebAssembly built from Rust, the **source code**
(`pass-firefox-source.zip`, see below). The add-on ID `pass@sensyble.com` must stay the same across channels and
versions: the native host and the redirect URLs depend on it.

## What to upload

```sh
cd Extension && npm run wasm && cd ../Firefox && npm run package
```

* `Firefox/dist/pass-firefox.zip`: the add-on.
* `Firefox/dist/pass-firefox-source.zip`: the source (the crates the WebAssembly is built from, the extension,
  this folder, `Cargo.lock`, a trimmed workspace `Cargo.toml`, and `BUILDING.md` with the tool versions this
  package was built with and the steps to rebuild).
* Notes for reviewers: [`amo/reviewer-notes.md`](amo/reviewer-notes.md).
* Bump `version` in `Extension/manifest.json` first; AMO refuses a version it has seen.

For a byte-identical rebuild the reviewer needs the same Rust and wasm-bindgen versions (BUILDING.md lists them) and
a build folder whose path has the same length (Rust keeps source paths in panic messages). Building from a
fixed path, for example `/home/user/pass`, makes that easy to state.

## Listed on AMO

1. Developer Hub (https://addons.mozilla.org/developers/), **Submit a New Add-on**, **On this site**.
2. Upload `pass-firefox.zip`; platforms: Firefox for desktop only (no native messaging on Android).
3. Answer "Do you use code generators, minifiers or WebAssembly?" with yes, upload `pass-firefox-source.zip`.
4. Listing: the texts in [`amo/`](amo/) (name and summary come from `_locales/*/messages.json`); category
   "Privacy & Security"; support site https://help.passyble.com/; privacy policy: the one for the Chrome Web
   Store, updated for browser-mode sync and account sign-in (Core/docs/EXTENSION_VAULT.md, section 9).
5. Data collection: the manifest's `data_collection_permissions` is what Firefox shows; check it against AMO's
   policy at that time (Core/docs/EXTENSION_VAULT.md, decision 9).

## Unlisted (self-hosted)

Signing from the command line with an AMO API key (Developer Hub, **Manage API Keys**):

```sh
cd Firefox
npx web-ext sign --channel unlisted --source-dir dist/unpacked \
  --upload-source-code dist/pass-firefox-source.zip \
  --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

The key and secret are the owner's; keep them out of the repo (environment variables `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`). `web-ext sign` waits for the signature and saves the signed `.xpi` in `web-ext-artifacts/`.

Self-hosted updates need `browser_specific_settings.gecko.update_url` (an HTTPS URL of an `updates.json`) in the
manifest. It is not in `manifest.overrides.json` today, because a listed add-on must not have one. To ship unlisted,
add it to the overrides for that build only, and publish an `updates.json` like:

```json
{
  "addons": {
    "pass@sensyble.com": {
      "updates": [
        { "version": "0.2.0", "update_link": "https://passyble.com/download/firefox/passyble-0.2.0.xpi" }
      ]
    }
  }
}
```

Firefox checks `update_url` about once a day. An unlisted `.xpi` installs by opening it in Firefox (a website link
needs the site to be allowed to install add-ons, or the user drags the file onto Firefox), or through Firefox's
enterprise policy `ExtensionSettings` with `install_url`.

## Enterprise

IT can force-install either channel with the `ExtensionSettings` policy (`installation_mode: "force_installed"`,
`install_url`: the AMO latest-version URL or our `.xpi`). The native host still comes from the Passyble desktop
installer.
