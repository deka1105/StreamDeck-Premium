"""DeskAssist for Blender: lets the DeskAssist panel change a fixed set of
things in Blender. Listens on 127.0.0.1:18790 only, needs DeskAssist's token,
and accepts only the operations in OPS, with clamped values. Uses only
Blender's documented Python API (bpy).

Install: Blender › Edit › Preferences › Add-ons › Install from Disk…, pick
this file, tick "DeskAssist", then paste the token DeskAssist's editor shows
into the add-on's preferences.
"""

bl_info = {
    "name": "DeskAssist",
    "author": "DeskAssist",
    "version": (1, 0, 0),
    "blender": (3, 6, 0),
    "location": "Runs in the background",
    "description": "Control a few Blender settings from the DeskAssist panel",
    "category": "Interface",
}

import json
import queue
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 18790

# op -> (kind, min, max). Nothing outside this table can run.
OPS = {
    "mode": ("choice", ("OBJECT", "EDIT", "SCULPT", "TEXTURE_PAINT", "WEIGHT_PAINT", "VERTEX_PAINT"), None),
    "rotation": ("number", -360.0, 360.0),
    "focal": ("number", 1.0, 5000.0),
    "light_power": ("number", 0.0, 1000000.0),
    "sun_strength": ("number", 0.0, 1000.0),
    "brush_size": ("number", 1.0, 5000.0),
    "brush_strength": ("number", 0.0, 1.0),
    "frame_selected": ("action", None, None),
    "camera_view": ("action", None, None),
    "xray": ("action", None, None),
    "shading": ("choice", ("WIREFRAME", "SOLID", "MATERIAL", "RENDERED"), None),
    "state": ("action", None, None),
}
AXES = ("X", "Y", "Z")


def validate(op, value=None, axis=None):
    """Check a request against OPS. Returns (op, value, axis) or raises ValueError. Pure."""
    if op not in OPS:
        raise ValueError("unknown operation")
    kind, a, b = OPS[op]
    if kind == "choice":
        v = str(value or "").upper()
        if v not in a:
            raise ValueError("not one of the allowed choices")
        return op, v, None
    if kind == "number":
        try:
            v = float(value)
        except (TypeError, ValueError):
            raise ValueError("not a number")
        if v != v or v in (float("inf"), float("-inf")):
            raise ValueError("not a number")
        v = max(a, min(b, v))
        ax = None
        if op == "rotation":
            ax = str(axis or "").upper()
            if ax not in AXES:
                raise ValueError("axis must be X, Y or Z")
        return op, v, ax
    return op, None, None


# ---------------------------------------------------------------- Blender ----
# Everything below touches bpy and runs on Blender's main thread.

_jobs = queue.Queue()
_server = None


def _apply(op, value, axis):
    import bpy  # noqa: imported here so the validator above runs without Blender
    import math

    ctx = bpy.context
    obj = ctx.active_object
    if op == "state":
        out = {"mode": ctx.mode, "object": obj.name if obj else None}
        if obj and obj.type == "CAMERA":
            out["focal"] = obj.data.lens
        if obj and obj.type == "LIGHT":
            out["light_power"] = obj.data.energy
        return out
    if op == "mode":
        if obj:
            bpy.ops.object.mode_set(mode=value)
    elif op == "rotation":
        if obj:
            obj.rotation_euler["XYZ".index(axis)] = math.radians(value)
    elif op == "focal":
        cam = obj if obj and obj.type == "CAMERA" else ctx.scene.camera
        if cam:
            cam.data.lens = value
    elif op in ("light_power", "sun_strength"):
        if obj and obj.type == "LIGHT":
            obj.data.energy = value
    elif op in ("brush_size", "brush_strength"):
        settings = ctx.tool_settings.sculpt or ctx.tool_settings.unified_paint_settings
        brush = ctx.tool_settings.sculpt.brush if ctx.tool_settings.sculpt else None
        if op == "brush_size":
            ctx.tool_settings.unified_paint_settings.size = int(value)
            if brush:
                brush.size = int(value)
        elif brush:
            brush.strength = value
    elif op in ("frame_selected", "camera_view", "xray", "shading"):
        for area in ctx.screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            region = next((r for r in area.regions if r.type == "WINDOW"), None)
            if op == "xray":
                space.shading.show_xray = not space.shading.show_xray
            elif op == "shading":
                space.shading.type = value
            else:
                with ctx.temp_override(area=area, region=region):
                    if op == "frame_selected":
                        bpy.ops.view3d.view_selected()
                    else:
                        bpy.ops.view3d.view_camera()
            break
    return {"ok": True}


def _drain():
    while not _jobs.empty():
        op, value, axis, reply = _jobs.get()
        try:
            reply.put(_apply(op, value, axis))
        except Exception as err:  # report to DeskAssist rather than crash Blender
            reply.put({"error": str(err)})
    return 0.05


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        import bpy

        token = bpy.context.preferences.addons[__name__].preferences.token
        if not token or self.headers.get("x-deskassist-token") != token:
            return self._send(401, {"error": "Paste DeskAssist's token into the add-on's preferences."})
        if self.path != "/op":
            return self._send(404, {"error": "not found"})
        try:
            n = min(int(self.headers.get("content-length", "0")), 4096)
            body = json.loads(self.rfile.read(n) or b"{}")
            op, value, axis = validate(body.get("op"), body.get("value"), body.get("axis"))
        except (ValueError, json.JSONDecodeError) as err:
            return self._send(400, {"error": str(err)})
        reply = queue.Queue()
        _jobs.put((op, value, axis, reply))
        try:
            self._send(200, reply.get(timeout=3))
        except queue.Empty:
            self._send(504, {"error": "Blender is busy."})


def register():
    import bpy

    class DeskAssistPrefs(bpy.types.AddonPreferences):
        bl_idname = __name__
        token: bpy.props.StringProperty(name="DeskAssist token", subtype="PASSWORD")

        def draw(self, context):
            self.layout.prop(self, "token")
            self.layout.label(text="Find the token in DeskAssist's editor › Settings › Creative apps.")

    global _server, _Prefs
    _Prefs = DeskAssistPrefs
    bpy.utils.register_class(DeskAssistPrefs)
    _server = HTTPServer(("127.0.0.1", PORT), _Handler)
    threading.Thread(target=_server.serve_forever, daemon=True).start()
    bpy.app.timers.register(_drain, persistent=True)


def unregister():
    import bpy

    global _server
    if _server:
        _server.shutdown()
        _server = None
    if bpy.app.timers.is_registered(_drain):
        bpy.app.timers.unregister(_drain)
    bpy.utils.unregister_class(_Prefs)
