# Diagnostic BLE remote — development page

Live development site: https://twgjackman.github.io/disc-display-remote/dev/

Production site: https://twgjackman.github.io/disc-display-remote/

This `dev/index.html` is the published diagnostic/BLE test interface, copied intact from the parked `dev/diagnostics-2026-11-18` branch on 20 November 2026.

## Editing without rollbacks

- Edit `dev/index.html` **on main** to update the published development interface only.
- Edit the root application files (`index.html`, `app.js`, `styles.css`, assets) **on main** to update production only.
- Keep changes to production and development in their respective paths; do not overwrite the root index with the diagnostic index.
- The original `dev/diagnostics-2026-11-18` branch remains an archive/reference, NOT a deployed GitHub Pages source. Updating it alone will not update the live development URL.
- Production's service worker explicitly bypasses `/dev/` to prevent it serving cached development pages.

Both URLs use HTTPS for Web Bluetooth. You can keep them open side by side; the Bluetooth device/firmware may not accept two simultaneous BLE connections.
