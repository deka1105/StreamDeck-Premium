// Pure helpers: value checks and request validation. Covered by --selftest.

namespace DeskAssist.Helper;

internal static class Protocol
{
    public const string Version = "1.0.0";

    public static float Clamp01(float v) => float.IsNaN(v) ? 0f : Math.Clamp(v, 0f, 1f);

    public static int ClampPercent(int v) => Math.Clamp(v, 0, 100);

    /// <summary>"render" → 0 (eRender), "capture" → 1 (eCapture). Anything else is refused.</summary>
    public static int Flow(string? flow) => flow switch
    {
        null or "" or "render" or "output" => 0,
        "capture" or "input" => 1,
        _ => throw new HelperException("flow must be render or capture."),
    };

    /// <summary>A friendly name for a process: "spotify" → "Spotify", "msedge" → "Microsoft Edge".</summary>
    public static string Pretty(string process)
    {
        var known = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["msedge"] = "Microsoft Edge",
            ["chrome"] = "Chrome",
            ["firefox"] = "Firefox",
            ["discord"] = "Discord",
            ["spotify"] = "Spotify",
            ["teams"] = "Teams",
            ["ms-teams"] = "Teams",
            ["zoom"] = "Zoom",
            ["vlc"] = "VLC",
            ["obs64"] = "OBS",
            ["steam"] = "Steam",
            ["steamwebhelper"] = "Steam",
            ["applemusic"] = "Apple Music",
        };
        if (known.TryGetValue(process, out var n)) return n;
        return process.Length == 0 ? "App" : char.ToUpperInvariant(process[0]) + process[1..];
    }

    /// <summary>Checks run by `DeskAssistHelper --selftest` in CI. Returns failures.</summary>
    public static List<string> SelfTest()
    {
        var fails = new List<string>();
        void Eq<T>(T got, T want, string what)
        {
            if (!EqualityComparer<T>.Default.Equals(got, want)) fails.Add($"{what}: got {got}, want {want}");
        }
        Eq(Clamp01(1.5f), 1f, "clamp high");
        Eq(Clamp01(-1f), 0f, "clamp low");
        Eq(Clamp01(float.NaN), 0f, "clamp NaN");
        Eq(ClampPercent(250), 100, "percent high");
        Eq(Flow("capture"), 1, "flow capture");
        Eq(Flow(null), 0, "flow default");
        try
        {
            Flow("speaker");
            fails.Add("flow speaker should be refused");
        }
        catch (HelperException) { }
        Eq(Pretty("msedge"), "Microsoft Edge", "pretty edge");
        Eq(Pretty("foobar2000"), "Foobar2000", "pretty other");
        return fails;
    }
}
