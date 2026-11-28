# Creative app controls (Stage 17)

The owner has none of these apps, so every control is **built from the vendors' documentation and untested** until it is tried on a real copy. Nothing drives an app by moving the mouse (D13). The phone only ever sends ids and numbers; script text is fixed in `desktop/src/creative/index.mjs`.

| App | Tool keys (published shortcuts) | Precise value | Colour | Route |
|---|---|---|---|---|
| Photoshop | 24 tools (V, M, L, W, C, I, J, B, S, Y, E, G, O, P, T, A, U, H, R, Z, X, D, `[` `]`) | Layer opacity (`activeLayer.opacity`) | Foreground colour (`app.foregroundColor`) | macOS: AppleScript `do javascript`; Windows: COM `Photoshop.Application.DoJavaScript` |
| Illustrator | 23 tools | Stroke weight and opacity of the selection (`strokeWidth`, `opacity`) | Fill of the selection and the default fill (`RGBColor`) | macOS: `do javascript`; Windows: COM `Illustrator.Application.DoJavaScript` |
| After Effects | 12 tools | The selected one-number property (`PropertyValueType.OneD`, `setValue` inside an undo group) | A selected colour property (`PropertyValueType.COLOR`) | macOS: AppleScript `DoScript`. Windows: keys only (no documented COM route). |
| Premiere Pro | 12 editing tools | — | — | Keys only. Premiere's scripting needs a CEP/UXP panel inside the app, which is not built. |
| Blender | — | Rotation X/Y/Z, camera focal length, light power / sun strength, sculpt brush size and strength | — | Our add-on (`desktop/blender/deskassist_blender.py`): loopback 127.0.0.1:18790, token, fixed operation table, clamped values, run on Blender's main thread through `bpy.app.timers` |

**Left out on purpose:**
- **Photoshop brush size as a precise value.** Photoshop's documented DOM has no property for it; the only routes are undocumented Action Manager descriptors. The `[` / `]` keys (documented) are offered instead.
- **"Colour control appears when the colour picker is open."** Detecting that needs the window list through Accessibility, and window titles vary by language and version. The colour control is always shown on the app's page instead.

**Context switch:** the rules engine's "app in front" trigger (Stage 8), with editor examples "Photoshop in front → Photoshop page" and "Blender in front → Blender page". Templates exist for each app.

**Tests:**
- `desktop/src/creative/creative.test.mjs`: shortcuts per OS, script templates take only validated numbers, scripts are passed as arguments, at most 4 updates a second, and the Blender token.
- `desktop/blender/test_deskassist_blender.py`: the add-on's whitelist, without Blender.
- `tools/ui-tests/tests/creative.spec.mjs`: the panel in demo mode, and the host refusing unknown tools, controls and colours.
