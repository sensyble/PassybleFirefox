# Contributing

Thank you for helping with Passyble for Firefox. This file says how to build and test it, what a pull request
needs, and the terms your contribution is under.

> **Pull requests are not accepted yet.** We are still reviewing the Contributor License Agreement, so please
> don't open outside pull requests for now. Issues and security reports are welcome: open an issue for bugs and
> ideas, and report security problems as [SECURITY.md](SECURITY.md) describes.

## Before you start

* **Security issues:** never in a public issue or pull request. See [SECURITY.md](SECURITY.md).
* **Bugs:** open an issue with the version, the platform and the steps that show the problem.
* **Larger changes:** open an issue first, so we can agree on the approach before you spend time on it.

## Build and test

[README.md](README.md), section "Repository", lists the sibling repositories to clone next to this one (the
Passyble repositories sit side by side in one folder) and the test commands. In short, from this repository's
root:

```sh
cd ../Extension && npm run wasm              # the browser vault's WebAssembly, once per change
cd ../Firefox
npm install && npm test                      # the scripts (overrides, redirect URLs, packages)
npm run package && npm run lint              # dist/pass-firefox.zip and web-ext lint
```

Rust builds run in the sibling Core repository. On Windows, run cargo there at idle priority through
`..\Core\scripts\cargo-low.cmd`, so a build doesn't slow the PC down.

## Pull requests

* One topic per pull request, with tests for what it changes or fixes.
* All tests and checks pass, including `node scripts/check-no-emdash.mjs`: no em dashes (U+2014) anywhere, in
  code, strings, comments or docs. Use a period, comma, colon or parentheses instead.
* Tests write only to temporary folders. They never touch a real home folder, browser profile, keychain or
  keyring.
* Never commit secrets: signing keys, passwords, tokens, OAuth client secrets or `.env` files.
* Write commit messages and texts in plain, short words.

## Contributor License Agreement

The CLA is not in force yet (see the note at the top), so there is nothing to sign for now. What follows is how it will
work once it is.

Passyble uses a Contributor License Agreement (CLA), not the Developer Certificate of Origin (DCO). Before we
can merge your first pull request, please sign the Sensyble Individual Contributor License Agreement in
[CLA.md](CLA.md). To sign, add this comment to your pull request, exactly as written:

```text
I have read the CLA Document and I hereby sign the CLA
```

The CLA check on your pull request asks for it and records your GitHub user name with the comment as your
signature. You sign once, and it covers your later contributions too (each Passyble repository keeps its own
record, so another repository may ask once more). If you can't sign on GitHub, e-mail support@passyble.com
(CLA.md, section 10 says how). If you contribute for your employer, we need a corporate agreement first: write
to support@passyble.com.

You keep the copyright in your work. The CLA lets Sensyble LLC also distribute your contribution under terms other
than the project's licence. Sensyble needs that to ship Passyble through app stores (such as the App Store, Google
Play and the browser add-on stores) whose terms don't fit the AGPL, and to use the shared code in its own
services. In return, Sensyble promises that your contribution stays available under the project's open source
licence (CLA.md, section 3).

## Licence

The code is licensed under the GNU Affero General Public License, version 3 or (at your option) any later version
([LICENSE](LICENSE)). Sensyble LLC may distribute its own builds, such as the app-store builds, under other terms.
Third-party parts keep their own licences ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

## Trademarks

The Passyble and Sensyble names and logos are not covered by the code licence: see [TRADEMARKS.md](TRADEMARKS.md).
