# Disc Display Remote — production v1.4

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

## v1.1 artwork and track listings
- 57 physical disc pictures extracted from `Discs 2x4.pptx` and packed into an 8×8 responsive WebP sprite atlas.
- 61 square album covers and 887 track-list entries extracted from `Track Listing.docx` and packed into a 400px-per-cell 8×8 WebP cover atlas.
- Word image relationship order for the first eleven albums differs from album order; corrected by matching artwork to PowerPoint source.
- The last four slots (58–61) are non-disc albums and only use square artwork.
- Original track names are shown in the player and accessible through the library. Track-number jumps and seeking require new BLE firmware commands; clicking a track cannot currently select it.
- Android physical volume keys cannot be redirected to independent Bluetooth GATT volume through an ordinary PWA; v1.1 adds clear on-screen +/- steps alongside the slider/vertical swipe.

## v1.2 layout and interaction
- The frame is rebuilt from individual `Discs 2x4.pptx` images, with certification colours read from picture outlines: silver = black, gold = gold, platinum = white.
- Textured platinum backplates are taken from the PowerPoint oval fill: slot 3 ×3 blanks, 10 ×4, 13 ×1, 20 ×1, 23 ×2, 26 ×1, 28 ×1, 44 ×1, 45 ×4, 48 ×1. Front artwork is counted as one additional platinum.
- Landscape displays five physical rows and a Grammy/live album target at visual position 58. Tap targets travel with their circle images rather than relying on coordinates over a flattened screenshot.
- Portrait transposes physical rows into five vertical columns; each column has matching first/last disc heights. Spacing is weighted for platinum stacks to avoid overlap.
- Search returns albums by artist/title, then matching tracks grouped by artist and album. Search dialog is top-aligned and keyboard-aware.
- Now Playing is a portrait overlay that can be dismissed via the grabber, with art zoom, vertical volume slider, and decorative stereo activity meters. Meters are illustrative, not audio level measurements.
- Physical phone hardware volume keys cannot be captured by the browser PWA. BLE playback and settings retain the production command set. Direct track jump and scrubbing still require firmware support.
- Production source retains no diagnostic or simulated-system BLE controls.

## v1.3 interface refinements
- Landscape player: full viewport two-column layout, no permanent topbar, no Now Playing heading, no collection eyebrow; just a compact X to return to the frame. The left column fits album/volume/playback controls on one landscape screen while the right track list scrolls independently.
- Landscape frame: the wood-textured bottom strip now contains the Now Playing chip, a text-width sales plaque, and a background-free settings icon.
- Landscape Settings modal is centred, bordered on all four sides and constrained to the available screen height. The BLE override explanatory line has been removed (behaviour unchanged).
- Portrait: "View all" removed; search icon only; persistent footer button renamed to "Now Playing."
- Portrait album stacks: reflective jewel-side CD undersides show successive exposed TOP edges; the printed album is the bottom/front disc of the stack. The first and last printed album images of all five columns align, including the Ultimate Kylie stack.
- Portrait player drawer: wider grabber, inset from the top; pointer dragging moves the whole drawer. Short drag springs back; passing a dismissal threshold sends it offscreen to reveal the collection. Simply tapping no longer closes it.
- Visible physical disc numbers removed from interface labels, tooltips and metadata; numeric slot IDs remain private BLE protocol details.
- Stereo meter animation uses an absolute-height green -> yellow -> orange -> red gradient. Lower green readings do not show higher-level colours. Meter movement is illustrative, not derived from audio sample levels.
- Original generated blank CD underside art was created for this project, and cached offline. The previous brushed metal disc image remains in the repository history.

## v1.4 detail fixes
- Removed the visible percentage beneath the vertical Now Playing volume slider. The native range input remains fully labelled for assistive technology.
- Track numbers displayed in Now Playing and track search are calculated from the source listing. A combined recording explicitly containing the next track number is labelled as a range (e.g. 03–04), and the following entry advances to 05. Audio file indices and catalogue titles are left unchanged.
- Reversed multi-platinum layers: printed album artwork is now the top/front disc in both orientations, and reflective jewel-side CDs project below in portrait or to the right in landscape. Portrait column bottoms align to the entire final stack, not just the printed artwork.
- Reflective CD iridescence changes with vertical scrolling. An optional **Enable tilt** action in Settings activates motion input where the browser permits it, requesting sensor permission only on user interaction when required; scrolling always works. Motion preference is respected.
- Grammy/e-ink square proxy now shows the active ring when any non-disc album (58–61) is selected.
- The Live Albums modal is centred in landscape with visible borders and safe-height scrolling.
- No new ESP32 or BLE commands; no diagnostics in production.
