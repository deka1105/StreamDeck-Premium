# 3D printers (Stage 14)

The owner has no printers, so every brand is **built from its public protocol description and untested on real hardware**. The editor says so next to each printer. Users add printers in **Settings › 3D printers** and press **Test connection**.

The computer polls printers only while a Printer or Printers widget is on some layout. The phone never talks to a printer (D11). Failures back off (5 s, 10 s, … up to 60 s). Brands that allow one client at a time (Bambu, Elegoo) keep a single live link.

| Brand | Transport | Auth | Fields we read | Clients | Source |
|---|---|---|---|---|---|
| Klipper / Moonraker | HTTP, port 7125 (or 80 behind a proxy), polled every 2 s | Optional `X-Api-Key` | state, progress, layer from `print_stats.info`, time left from file metadata `estimated_time`, temps incl. a `temperature_sensor …chamber`, speed factor, filament colours from metadata | many | Moonraker's published API docs |
| OctoPrint | REST: `/api/job`, `/api/printer` | `X-Api-Key` | state, completion, `printTimeLeft`, file, tool0/bed/chamber temps; 409 = printer not operational | many | OctoPrint REST API docs |
| PrusaLink | HTTP: `/api/v1/status`, `/api/v1/job` | HTTP Digest (user `maker`) or `X-Api-Key` | state, progress, time remaining, temps, speed, file (no layers or colours) | many | PrusaLink OpenAPI spec |
| Bambu Lab (LAN) | MQTT over TLS, port 8883; subscribe `device/<serial>/report`, publish `pushall` to `device/<serial>/request` | user `bblp` + LAN access code | `gcode_state`, `mc_percent`, `mc_remaining_time`, layers, temps incl. chamber, `spd_lvl`, `print_error`, AMS trays (`tray_color`, `tray_type`, `tray_now`) and the external spool. Newer firmware sends only changes, which we merge. | limited (single link kept) | Community protocol documentation (prose). Cloud login is **not** implemented (R9). |
| Elegoo Centauri Carbon | SDCP v3 over WebSocket `ws://host:3030/websocket`, status request `Cmd 0` | none on LAN | `CurrentStatus`, `PrintInfo` (status, layers, ticks, file), nozzle/bed/box temps | limited | Elegoo's published SDCP specification |
| Flashforge (newer) | HTTP `POST :8898/detail` with serial number + check code | check code | status, progress, estimated time, layers, temps incl. chamber, speed, material station slots | many | Community documentation |
| Flashforge (older) | G-code over TCP 8899: `~M601 S1`, `~M105`, `~M27`, `~M119` | none | temps, SD progress, machine status, file | one | Community documentation |
| Snapmaker 2.0 | HTTP :8080 `/api/v1/connect` (approve on the touchscreen), `/api/v1/status?token=` | token | status, progress, remaining time, temps, file | one | Snapmaker's HTTP API documentation |

**Not offered (no clean source, R9):** Creality stock firmware (WebSocket 9999), Anycubic LAN mode (MQTT), Snapmaker J1/Artisan (SACP on 8888). Each is known only through other projects' code. They can be added if the owner or a user captures their printer's traffic so we can write from observed behaviour.

## Tests

`desktop/src/printers/printers.test.mjs` covers:
- each brand against a local fixture: HTTP servers, a fake MQTT broker, a fake SDCP WebSocket server and a fake G-code port;
- the Digest login;
- Bambu's incremental merge;
- Snapmaker's approve-on-screen token;
- back-off.

`tools/ui-tests/tests/printers.spec.mjs` checks the page with four printers in demo mode, and an editor-added Klipper printer end to end.
