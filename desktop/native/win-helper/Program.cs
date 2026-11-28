// Entry point: one JSON request per stdin line, one JSON reply per stdout line.
//   → {"id":1,"op":"devices","flow":"render"}
//   ← {"id":1,"ok":true,"result":[...]}  or  {"id":1,"ok":false,"error":"..."}
// The first line written is {"ready":true,"version":"…"}.

using System.Text;
using System.Text.Json;
using DeskAssist.Helper;

if (args.Contains("--selftest"))
{
    var fails = Protocol.SelfTest();
    foreach (var f in fails) Console.Error.WriteLine($"FAIL {f}");
    Console.WriteLine(fails.Count == 0 ? "selftest ok" : $"selftest: {fails.Count} failed");
    return fails.Count == 0 ? 0 : 1;
}

Native.CoInitializeEx(IntPtr.Zero, 0); // COINIT_MULTITHREADED
var stdout = Console.OpenStandardOutput();
var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));

void Write(Action<Utf8JsonWriter> body)
{
    using var ms = new MemoryStream();
    using (var w = new Utf8JsonWriter(ms))
    {
        w.WriteStartObject();
        body(w);
        w.WriteEndObject();
    }
    ms.WriteByte((byte)'\n');
    stdout.Write(ms.GetBuffer(), 0, (int)ms.Length);
    stdout.Flush();
}

Write(w =>
{
    w.WriteBoolean("ready", true);
    w.WriteString("version", Protocol.Version);
});

string? line;
while ((line = stdin.ReadLine()) is not null)
{
    if (string.IsNullOrWhiteSpace(line)) continue;
    JsonElement req;
    long id = 0;
    try
    {
        req = JsonDocument.Parse(line).RootElement;
        if (req.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number) id = idEl.GetInt64();
    }
    catch (JsonException)
    {
        Write(w =>
        {
            w.WriteNumber("id", 0);
            w.WriteBoolean("ok", false);
            w.WriteString("error", "Not JSON.");
        });
        continue;
    }
    try
    {
        var result = Handle(req);
        Write(w =>
        {
            w.WriteNumber("id", id);
            w.WriteBoolean("ok", true);
            w.WritePropertyName("result");
            result(w);
        });
    }
    catch (Exception err)
    {
        var msg = err is HelperException ? err.Message : $"{err.GetType().Name}: {err.Message}";
        Write(w =>
        {
            w.WriteNumber("id", id);
            w.WriteBoolean("ok", false);
            w.WriteString("error", msg);
        });
    }
}
return 0;

static string? Str(JsonElement r, string key) => r.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
static float Num(JsonElement r, string key) => r.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetSingle() : throw new HelperException($"{key} must be a number.");
static bool Bool(JsonElement r, string key) => r.TryGetProperty(key, out var v) && (v.ValueKind == JsonValueKind.True || v.ValueKind == JsonValueKind.False) ? v.GetBoolean() : throw new HelperException($"{key} must be true or false.");

static Action<Utf8JsonWriter> Done() => w => w.WriteBooleanValue(true);

static Action<Utf8JsonWriter> Handle(JsonElement r)
{
    switch (Str(r, "op"))
    {
        case "ping":
            return w =>
            {
                w.WriteStartObject();
                w.WriteString("version", Protocol.Version);
                w.WriteEndObject();
            };
        case "devices":
        {
            var list = Audio.Devices(Protocol.Flow(Str(r, "flow")));
            return w =>
            {
                w.WriteStartArray();
                foreach (var d in list)
                {
                    w.WriteStartObject();
                    w.WriteString("id", d.Id);
                    w.WriteString("name", d.Name);
                    w.WriteBoolean("default", d.IsDefault);
                    w.WriteNumber("volume", Math.Round(d.Volume, 3));
                    w.WriteBoolean("muted", d.Muted);
                    w.WriteNumber("peak", Math.Round(d.Peak, 3));
                    w.WriteEndObject();
                }
                w.WriteEndArray();
            };
        }
        case "deviceState":
        {
            var (vol, muted) = Audio.DeviceState(Str(r, "id"), Protocol.Flow(Str(r, "flow")));
            return w =>
            {
                w.WriteStartObject();
                w.WriteNumber("volume", Math.Round(vol, 3));
                w.WriteBoolean("muted", muted);
                w.WriteEndObject();
            };
        }
        case "setDefault":
            Audio.SetDefault(Str(r, "id") ?? throw new HelperException("id is required."));
            return Done();
        case "setDeviceVolume":
            Audio.SetDeviceVolume(Str(r, "id"), Protocol.Flow(Str(r, "flow")), Num(r, "volume"));
            return Done();
        case "setDeviceMute":
            Audio.SetDeviceMute(Str(r, "id"), Protocol.Flow(Str(r, "flow")), Bool(r, "muted"));
            return Done();
        case "sessions":
        {
            var list = Audio.Sessions();
            return w =>
            {
                w.WriteStartArray();
                foreach (var s in list)
                {
                    w.WriteStartObject();
                    w.WriteString("name", s.Name);
                    w.WriteString("display", s.Display);
                    w.WriteNumber("volume", Math.Round(s.Volume, 3));
                    w.WriteBoolean("muted", s.Muted);
                    w.WriteNumber("peak", Math.Round(s.Peak, 3));
                    w.WriteBoolean("system", s.System);
                    w.WriteEndObject();
                }
                w.WriteEndArray();
            };
        }
        case "setSessionVolume":
            Audio.SetSessionVolume(Str(r, "name") ?? throw new HelperException("name is required."), Num(r, "volume"));
            return Done();
        case "setSessionMute":
            Audio.SetSessionMute(Str(r, "name") ?? throw new HelperException("name is required."), Bool(r, "muted"));
            return Done();
        case "monitors":
        {
            var list = Display.Monitors();
            return w =>
            {
                w.WriteStartArray();
                foreach (var m in list)
                {
                    w.WriteStartObject();
                    w.WriteNumber("index", m.Index);
                    w.WriteString("name", m.Name);
                    w.WriteNumber("percent", m.Max > m.Min ? Math.Round(100.0 * (m.Current - m.Min) / (m.Max - m.Min)) : 0);
                    w.WriteEndObject();
                }
                w.WriteEndArray();
            };
        }
        case "setBrightness":
            Display.SetBrightness((int)Num(r, "index"), (int)Num(r, "percent"));
            return Done();
        case "lock":
            Display.Lock();
            return Done();
        case "sleep":
            Display.Sleep();
            return Done();
        default:
            throw new HelperException("Unknown request.");
    }
}
