Passyble for Firefox: privacy policy

Passyble is made by Sensyble LLC (www.sensyble.net). This is the part of the Passyble privacy policy that covers the Firefox add-on. The full policy, for all Passyble apps and the website: https://passyble.com/privacy/

Where your vault is

You choose one of two places in the add-on's settings ("Vault"):

* In the Passyble app: if the Passyble desktop app is installed, the add-on talks to it on the same computer through Firefox's native messaging. The app holds and syncs the vault.
* In this browser: the add-on keeps its own encrypted vault, with no app needed.

In both modes the add-on sends nothing about you or your vault to Sensyble or any other server. It makes two kinds of requests: every few hours it asks account.passyble.com for the minimum supported version (a public list that is the same for everyone; nothing about you, your device or your vault is sent, though like any web request it shows your IP address), and if you choose Sign in, it contacts the Passyble account service (see Signing in). There is no analytics, advertising or crash reporting.

Reading pages

To find sign-in, 2FA, card and address fields, the add-on looks at the pages you visit, in your browser. Page contents are not stored or sent anywhere. In app mode, the app on your computer gets the page's address (to find matching logins) and what you choose to save.

Secrets

The add-on gives a web page one login at a time, only for the site it is saved for. A password you just typed into a sign-in form is held in memory only until you answer the "Save login?" prompt, and for a minute at most. A copied password or code is cleared from the clipboard after 45 seconds.

In app mode, the add-on never stores passwords, codes or other secrets. If you type your master password into the add-on's unlock form, it goes straight to the Passyble app on your computer, is used once and is never stored or logged.

Vault in this browser

The encrypted vault is stored in the add-on's own storage in this Firefox profile (IndexedDB). Your master password goes through Argon2id inside the add-on, and items are encrypted with XChaCha20-Poly1305. The master password never leaves your browser and is never stored or logged. While unlocked, the vault key is kept in the browser's session storage, which only the add-on's own pages can read, and it is removed when the vault locks (after the idle time you set, when your computer locks, and when Firefox closes). In this mode the add-on does not sync, fetch website icons or check passwords against breach lists. A backup is the same encrypted file, downloaded to your computer when you choose it. Removing the add-on or the Firefox profile deletes the vault in the browser, so keep a backup.

What else it stores

Your add-on settings, the sites where you chose "Never for this site" (addresses only), whether it turned off Firefox's own password saving, and whether you finished the setup guide. None of this is secret.

Signing in (optional)

The add-on works the same without signing in. If you choose Sign in with the vault in this browser, the sign-in page of account.passyble.com opens in a browser sign-in window, on Sensyble's website. The add-on then receives a sign-in token and your account's e-mail address and keeps them in its own storage. It contacts account.passyble.com only to finish signing in, to renew that token when needed and to sign out. These requests carry the token and nothing from your vault; like any web request, they show your IP address. Your master password is never sent to Sensyble. With the Passyble app installed, Sign in only opens account.passyble.com in a new tab.

Firefox data collection

The add-on declares that it requires no data collection. Signing in uses the optional categories authentication information and personally identifying information (your e-mail address), and Firefox asks for your consent before that.

Permissions

* Access to websites, scripting, activeTab: find, show the Passyble menu in and fill sign-in, 2FA, card and address fields, in your browser only.
* Native messaging: talk to the Passyble app on the same computer.
* Privacy: once, offer to turn off Firefox's own password saving so two password managers don't compete (with Undo).
* Storage, unlimited storage: keep settings, and a vault in this browser without Firefox removing it when space runs low.
* Clipboard write, alarms: copy when you ask, and clear the clipboard after 45 seconds.
* Context menus: "Fill with Passyble" and "Generate password".
* Idle: lock the vault when your computer locks.
* Identity: open the account sign-in window when you choose Sign in.

Contact

Sensyble LLC, Sheridan, Wyoming, USA. hello@sensyble.net. Full policy: https://passyble.com/privacy/
