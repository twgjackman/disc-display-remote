# Disc Display Remote — production v1

A mobile-first, offline-capable progressive web app controlling the physical Gregg Jackman framed disc collection over Web Bluetooth. Production source deliberately contains no BLE debug/log/serial/board-test controls.

- **Production:** https://twgjackman.github.io/disc-display-remote/
- **Preserved diagnostics:** branch `dev/diagnostics-2026-11-18`
- **Browser support:** Android Chrome and compatible desktop Chrome/Edge, HTTPS required.
- **Bluetooth:** OS/browser picker on first authorization; previously permitted device reconnection with `getDevices()` where supported.
- **Firmware:** firmware enforces BLE authorization, not the web page. Current Bluedroid firmware GATT command characteristic lacks authenticated bond/write requirement; secure this before treating the device as paired-only.
- **Known limitations:** direct track selection and arbitrary seeking have no BLE command in inspected firmware. Controls are visible as non-destructive previews, with explicit explanation. No remote low-power switch because it would terminate BLE.
- **Art:** `assets/frame.webp` is an optimised image derived from the user-provided frame mock-up. Future square album artwork and high-resolution disc crops can be added in `assets/covers` and `assets/discs` without changing the interaction design.
- **Hardware layout:** 57 discs arranged 11,12,12,11,11; four non-disc artwork folders 58–61 selected via the e-ink artwork target.
- **Album catalog:** fetched from the ESP32's three-item GATT catalogue pages; cached in browser localStorage for faster offline browsing. Album details and names are furnished by the ESP32 when connected.

This webapp does not stream sound from the phone; it controls the frame's microSD audio player and its paired speaker.

## Future firmware additions
1. BLE bonding + authenticated encrypted write; physical enrolment distinct from triple-flick Audio speaker discovery.
2. Command for selecting an explicit track, and capability indicator.
3. Seek relative/absolute command with safe SD-audio task queue.
4. Carousel interval and LED brightness reporting; user-facing low-power command only with a recovery mechanism.
