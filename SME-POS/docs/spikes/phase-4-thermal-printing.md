# Spike · Bluetooth thermal printing (Phase 4)

> Status: **Ready to run against hardware** · Owner: Engineering · Decides: PWA-only vs Capacitor shell (ARCHITECTURE.md §11)

## Why this spike exists

Phase 4 retires one unknown: **can the offline till drive a Bluetooth thermal receipt printer from the PWA, or do we need a native (Capacitor) shell to do it reliably?** Everything else in "payments & receipts" (tender labels, the on-screen receipt, the ESC/POS layout) is already built and verified. This is the only piece that depends on physical hardware, so it can't be closed from code review alone — it has to be tested.

## What's already built (and verified in code)

- `hardware/escpos.ts` — pure ESC/POS encoder. Byte output is unit-checked (init, line items, totals, drawer-kick, cut). Reused unchanged by any transport.
- `hardware/printerService.ts` — Web Bluetooth transport: device chooser, writable-characteristic discovery, chunked streaming, browser-print fallback.
- `hardware/DeviceBridge.ts` — the till calls `deviceBridge.printReceipt()`; it delegates to the service. **The app code does not change regardless of how the spike lands** — only the transport behind the interface does.
- `ui/PrinterSettings.tsx` — connect / choose paper width / test print, reachable from the till header.

## Known constraints (these bias the decision before any test)

1. **Secure context required.** Web Bluetooth only runs on HTTPS or `localhost`. It will **not** run on `http://demo.wivae.test:8000`. To test the PWA path you must serve the till over HTTPS (Laravel Herd gives tenant subdomains HTTPS locally; or tunnel). If field devices can't get HTTPS on their tenant subdomain easily, that pushes toward Capacitor on its own.
2. **Chromium-only.** Chrome/Edge desktop and Chrome on Android. **No Web Bluetooth on iOS/Safari at all** — if iPads are in scope, the PWA path can't serve them and Capacitor (or a different iOS printing route) is mandatory.
3. **No universal BLE printer profile.** Cheap ESC/POS printers expose a writable characteristic under varying service UUIDs; the service probes a known set and then scans. Some printers won't match.
4. **Reconnection is weak.** Web Bluetooth reconnect after sleep/out-of-range often needs a fresh user gesture. We persist the printer name for UX, not a silent auto-reconnect.

## Test matrix

Run each printer × paper width × browser/host. Aim for at least two printer models (one 58mm, one 80mm).

| Variable | Values |
|---|---|
| Printer | ≥2 real BLE ESC/POS models (name them in results) |
| Paper | 58mm (32 col), 80mm (48 col) |
| Host | Chrome desktop (HTTPS), Chrome Android (HTTPS), installed PWA |
| State | first connect · reprint · after screen-lock · after out-of-range |

## What to measure

- **Connect success**: does the chooser list the printer, and does characteristic discovery find a writable one? (y/n per model)
- **Print fidelity**: alignment, that the line-item row `qty x name .... $price` isn't wrapping, totals bold, paper cuts. Photograph each.
- **Throughput / chunking**: does a full receipt print without dropped bytes at `CHUNK_SIZE=180`? If truncated, note the model and try smaller chunks.
- **Drawer kick**: if a cash drawer is wired to the printer, does `openDrawer()` fire it?
- **Reconnection**: after lock / range loss, how many taps to print again?
- **Fallback**: with no printer connected, does the browser print dialog still yield a usable receipt?

## Success criteria (PWA path is "good enough")

All must hold on the target field hardware:

- Both test printers connect and print a correctly formatted receipt over HTTPS.
- A full 10+ line receipt prints without truncation.
- Reconnect after lock is ≤ 2 taps.
- The target devices can actually get a secure context in the field.

## Decision gate

- **All success criteria met AND no iOS requirement** → **ship PWA-only.** No Capacitor. `printerService` is the production transport; delete this risk.
- **iOS/iPad in scope, OR secure context isn't feasible in the field, OR connect/reconnect is unreliable across target printers** → **build the Capacitor shell.** It provides native BLE (no secure-context limit, iOS support, better reconnection). The escpos encoder and `DeviceBridge` interface are reused as-is; only a `NativeDeviceBridge` calling a Capacitor BLE plugin is added. Nothing in the till or sync layer changes.

## If Capacitor is chosen — scope preview (not built yet)

- Wrap the built `public/pos/` in a Capacitor shell (`@capacitor/core` + a BLE plugin).
- Implement `NativeDeviceBridge implements DeviceBridge` → same `printReceipt(ReceiptContext)`, backed by native BLE writes of the **same** `encodeReceipt()` bytes.
- Bridge selection: native bridge when `Capacitor.isNativePlatform()`, else the Web bridge. One-line swap at the `deviceBridge` export.
- Everything else — cart, sync, outbox, receipt layout — is untouched. That's the whole point of putting hardware behind one interface.
