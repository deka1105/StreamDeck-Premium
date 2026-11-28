# Windows helper (Stage 12)

`desktop/native/win-helper` builds **DeskAssistHelper.exe**, a small native program (C#, compiled ahead of time with .NET NativeAOT, so the user's PC needs no .NET runtime). The host starts it on first use and talks to it over stdin/stdout, one JSON object per line. It stops after five idle minutes.

## Why this shape

| Option | Verdict |
|---|---|
| **C# NativeAOT sidecar** (chosen) | Direct Core Audio COM through source-generated COM interop: fast, no runtime, one ~3 MB file. Built and tested on `windows-latest` in CI. |
| PowerShell with inline C# | No binary to ship, but it compiles on every start (~1–2 s) and the Core Audio interop is clumsy and fragile there. |
| Rust sidecar | Equally good at runtime, but adds a second toolchain for the same Windows APIs. |

## What it does

| Request | Windows API |
|---|---|
| `devices`, `deviceState`, `setDeviceVolume`, `setDeviceMute` | `IMMDeviceEnumerator`, `IAudioEndpointVolume`, `IAudioMeterInformation` (documented) |
| `sessions`, `setSessionVolume`, `setSessionMute` | `IAudioSessionManager2`, `IAudioSessionControl2`, `ISimpleAudioVolume` (documented) |
| `setDefault` | `IPolicyConfig` (**undocumented**; the interface the Sound settings use). If it fails, the panel says switching is unavailable. |
| `monitors`, `setBrightness` | DDC/CI via `dxva2` (documented). A laptop's own panel goes through WMI `WmiMonitorBrightnessMethods` from the host. |
| `lock`, `sleep` | `LockWorkStation`, `SetSuspendState` |

Power plans (`powercfg`) and services (`Get-Service` / `Start-Service`) are run by the host directly, and only for services listed in the editor.

## Packaging and signing

- `npm run dist:win` runs `build:win-helper` first. electron-builder copies the `.exe` to `resources/win-helper/`.
- The helper is signed along with the app when Windows code signing is set up. Until then SmartScreen warns about the installer, not separately about the helper.
- Building needs the .NET 8 SDK on Windows (`winget install Microsoft.DotNet.SDK.8`).

## Tests

- `DeskAssistHelper.exe --selftest` checks value clamping and request validation (CI).
- `desktop/src/control/stage12.test.mjs` tests push-to-talk leases, ducking, profiles, power plans and services against a fake helper on every OS. On Windows CI it also drives the real `.exe` (ping, devices, sessions, monitors, refused requests).
- Live checks on a real PC are in `docs/CONTROL-DECK-CHECKS.md`.
