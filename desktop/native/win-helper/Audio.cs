// Core Audio operations: devices (with volume, mute and level), the default
// device, per-app sessions (volume, mute, level) and switching the default.

using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;

namespace DeskAssist.Helper;

internal sealed record DeviceInfo(string Id, string Name, bool IsDefault, float Volume, bool Muted, float Peak);
internal sealed record SessionInfo(string Name, string Display, uint[] Pids, float Volume, bool Muted, float Peak, bool System);

internal sealed class HelperException(string message) : Exception(message);

internal static class Audio
{
    static readonly StrategyBasedComWrappers Wrappers = new();
    static readonly PropertyKey FriendlyName = new() { fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), pid = 14 };
    static readonly Guid Ctx = new("6C6E7A5E-0D5C-4B8E-9E7B-2D3A5C1B8F40"); // our event context
    const uint DEVICE_STATE_ACTIVE = 1;
    const int E_NOTFOUND = unchecked((int)0x80070490);

    static T Create<T>(Guid clsid, Guid iid) where T : class
    {
        Check(Native.CoCreateInstance(clsid, IntPtr.Zero, Native.CLSCTX_ALL, iid, out var ptr), "create");
        try
        {
            return (T)Wrappers.GetOrCreateObjectForComInstance(ptr, CreateObjectFlags.None);
        }
        finally
        {
            Marshal.Release(ptr);
        }
    }

    static T Activate<T>(IMMDevice device, Guid iid) where T : class
    {
        Check(device.Activate(iid, Native.CLSCTX_ALL, IntPtr.Zero, out var ptr), "activate");
        try
        {
            return (T)Wrappers.GetOrCreateObjectForComInstance(ptr, CreateObjectFlags.None);
        }
        finally
        {
            Marshal.Release(ptr);
        }
    }

    static void Check(int hr, string what)
    {
        if (hr == E_NOTFOUND) throw new HelperException("No audio device of that kind is connected.");
        if (hr != Native.S_OK) throw new HelperException($"Windows audio refused {what} (0x{hr:X8}).");
    }

    static IMMDeviceEnumerator Enumerator() => Create<IMMDeviceEnumerator>(Clsid.MMDeviceEnumerator, Iid.IMMDeviceEnumerator);

    static string Id(IMMDevice d)
    {
        Check(d.GetId(out var id), "reading a device id");
        return id;
    }

    static string Name(IMMDevice d)
    {
        if (d.OpenPropertyStore(0, out var store) != Native.S_OK) return "Audio device";
        if (store.GetValue(FriendlyName, out var pv) != Native.S_OK) return "Audio device";
        try
        {
            return pv.vt == 31 && pv.p != IntPtr.Zero ? Marshal.PtrToStringUni(pv.p) ?? "Audio device" : "Audio device";
        }
        finally
        {
            Native.PropVariantClear(ref pv);
        }
    }

    static IMMDevice Default(IMMDeviceEnumerator e, int flow)
    {
        // Role 0 = eConsole, the one the Sound settings show as "default".
        Check(e.GetDefaultAudioEndpoint(flow, 0, out var d), "finding the default device");
        return d;
    }

    static IMMDevice ById(IMMDeviceEnumerator e, string? id, int flow) =>
        string.IsNullOrEmpty(id) ? Default(e, flow) : (e.GetDevice(id, out var d) == Native.S_OK ? d : throw new HelperException("That audio device is gone."));

    public static List<DeviceInfo> Devices(int flow)
    {
        var e = Enumerator();
        Check(e.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE, out var list), "listing devices");
        string? defaultId = null;
        try
        {
            defaultId = Id(Default(e, flow));
        }
        catch (HelperException) { /* no default: none connected */ }
        list.GetCount(out var n);
        var outList = new List<DeviceInfo>();
        for (uint i = 0; i < n; i++)
        {
            if (list.Item(i, out var d) != Native.S_OK) continue;
            var vol = Activate<IAudioEndpointVolume>(d, Iid.IAudioEndpointVolume);
            vol.GetMasterVolumeLevelScalar(out var level);
            vol.GetMute(out var muted);
            float peak = 0;
            try
            {
                Activate<IAudioMeterInformation>(d, Iid.IAudioMeterInformation).GetPeakValue(out peak);
            }
            catch (HelperException) { }
            var id = Id(d);
            outList.Add(new DeviceInfo(id, Name(d), id == defaultId, level, muted != 0, peak));
        }
        return outList;
    }

    public static void SetDeviceVolume(string? id, int flow, float level)
    {
        var d = ById(Enumerator(), id, flow);
        Check(Activate<IAudioEndpointVolume>(d, Iid.IAudioEndpointVolume).SetMasterVolumeLevelScalar(Protocol.Clamp01(level), Ctx), "setting the volume");
    }

    public static void SetDeviceMute(string? id, int flow, bool muted)
    {
        var d = ById(Enumerator(), id, flow);
        Check(Activate<IAudioEndpointVolume>(d, Iid.IAudioEndpointVolume).SetMute(muted ? 1 : 0, Ctx), "muting");
    }

    public static (float Volume, bool Muted) DeviceState(string? id, int flow)
    {
        var v = Activate<IAudioEndpointVolume>(ById(Enumerator(), id, flow), Iid.IAudioEndpointVolume);
        v.GetMasterVolumeLevelScalar(out var level);
        v.GetMute(out var m);
        return (level, m != 0);
    }

    /// <summary>Make a device the default for every role (console, multimedia, communications).</summary>
    public static void SetDefault(string id)
    {
        var e = Enumerator();
        if (e.GetDevice(id, out _) != Native.S_OK) throw new HelperException("That audio device is gone.");
        IPolicyConfig policy;
        try
        {
            policy = Create<IPolicyConfig>(Clsid.PolicyConfigClient, Iid.IPolicyConfig);
        }
        catch (HelperException)
        {
            throw new HelperException("Switching the default device isn't available on this version of Windows.");
        }
        for (var role = 0; role < 3; role++) Check(policy.SetDefaultEndpoint(id, role), "switching the default device");
    }

    // ------------------------------------------------------------ sessions ----

    static string ProcessName(uint pid)
    {
        if (pid == 0) return "System sounds";
        try
        {
            using var p = Process.GetProcessById((int)pid);
            return p.ProcessName;
        }
        catch
        {
            return $"pid {pid}";
        }
    }

    sealed class Live(IAudioSessionControl2 control, string name, uint pid, bool system)
    {
        public IAudioSessionControl2 Control = control;
        public string Name = name;
        public uint Pid = pid;
        public bool System = system;
    }

    static List<Live> LiveSessions()
    {
        var device = Default(Enumerator(), 0);
        var mgr = Activate<IAudioSessionManager2>(device, Iid.IAudioSessionManager2);
        Check(mgr.GetSessionEnumerator(out var en), "listing app audio");
        en.GetCount(out var n);
        var list = new List<Live>();
        for (var i = 0; i < n; i++)
        {
            if (en.GetSession(i, out var s) != Native.S_OK) continue;
            s.GetState(out var state);
            if (state == 2) continue; // expired
            s.GetProcessId(out var pid);
            var system = s.IsSystemSoundsSession() == Native.S_OK;
            list.Add(new Live(s, system ? "System sounds" : ProcessName(pid), pid, system));
        }
        return list;
    }

    /// <summary>Apps playing on the default output, one row per app (an app may have several sessions).</summary>
    public static List<SessionInfo> Sessions()
    {
        var rows = new List<SessionInfo>();
        foreach (var g in LiveSessions().GroupBy(s => s.Name.ToLowerInvariant()))
        {
            var first = g.First();
            var vol = (ISimpleAudioVolume)first.Control;
            vol.GetMasterVolume(out var level);
            vol.GetMute(out var muted);
            float peak = 0;
            foreach (var s in g)
            {
                try
                {
                    ((IAudioMeterInformation)s.Control).GetPeakValue(out var p);
                    peak = Math.Max(peak, p);
                }
                catch (InvalidCastException) { }
            }
            first.Control.GetDisplayName(out var display);
            rows.Add(new SessionInfo(first.Name, string.IsNullOrWhiteSpace(display) || display.StartsWith('@') ? Protocol.Pretty(first.Name) : display, g.Select(s => s.Pid).Distinct().ToArray(), level, muted != 0, peak, first.System));
        }
        return rows.OrderBy(r => r.System ? 1 : 0).ThenBy(r => r.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    static IEnumerable<Live> Matching(string name)
    {
        var all = LiveSessions().Where(s => string.Equals(s.Name, name, StringComparison.OrdinalIgnoreCase)).ToList();
        if (all.Count == 0) throw new HelperException($"{Protocol.Pretty(name)} isn't playing any audio right now.");
        return all;
    }

    public static void SetSessionVolume(string name, float level)
    {
        foreach (var s in Matching(name)) ((ISimpleAudioVolume)s.Control).SetMasterVolume(Protocol.Clamp01(level), Ctx);
    }

    public static void SetSessionMute(string name, bool muted)
    {
        foreach (var s in Matching(name)) ((ISimpleAudioVolume)s.Control).SetMute(muted ? 1 : 0, Ctx);
    }

    /// <summary>Lower (or restore) every app except the named ones. Returns the levels before.</summary>
    public static Dictionary<string, float> Duck(float factor, ISet<string> except)
    {
        var before = new Dictionary<string, float>(StringComparer.OrdinalIgnoreCase);
        foreach (var s in LiveSessions())
        {
            if (s.System || except.Contains(s.Name)) continue;
            var v = (ISimpleAudioVolume)s.Control;
            v.GetMasterVolume(out var level);
            before.TryAdd(s.Name, level);
            v.SetMasterVolume(Protocol.Clamp01(level * factor), Ctx);
        }
        return before;
    }
}
