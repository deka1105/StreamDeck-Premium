// External monitor brightness over DDC/CI (dxva2), plus lock and sleep.

using System.Runtime.InteropServices;

namespace DeskAssist.Helper;

internal sealed record MonitorInfo(int Index, string Name, uint Min, uint Current, uint Max);

internal static unsafe class Display
{
    static readonly List<IntPtr> Found = new();

    [UnmanagedCallersOnly]
    static int OnMonitor(IntPtr monitor, IntPtr hdc, IntPtr rect, IntPtr data)
    {
        Found.Add(monitor);
        return 1;
    }

    /// <summary>Run `use` on every physical monitor that answers DDC/CI, in a stable order.</summary>
    static List<T> EachPhysical<T>(Func<int, IntPtr, string, T?> use) where T : class
    {
        Found.Clear();
        Native.EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, &OnMonitor, IntPtr.Zero);
        var results = new List<T>();
        var index = 0;
        foreach (var hmon in Found.ToArray())
        {
            if (!Native.GetNumberOfPhysicalMonitorsFromHMONITOR(hmon, out var n) || n == 0) continue;
            var arr = new PhysicalMonitor[n];
            fixed (PhysicalMonitor* p = arr)
            {
                if (!Native.GetPhysicalMonitorsFromHMONITOR(hmon, n, p)) continue;
                try
                {
                    for (var i = 0; i < n; i++)
                    {
                        var name = new string(p[i].description);
                        var r = use(index++, p[i].handle, string.IsNullOrWhiteSpace(name) ? "Display" : name.TrimEnd('\0'));
                        if (r is not null) results.Add(r);
                    }
                }
                finally
                {
                    Native.DestroyPhysicalMonitors(n, p);
                }
            }
        }
        return results;
    }

    public static List<MonitorInfo> Monitors() =>
        EachPhysical((i, h, name) => Native.GetMonitorBrightness(h, out var min, out var cur, out var max) ? new MonitorInfo(i, name, min, cur, max) : null);

    public static void SetBrightness(int index, int percent)
    {
        var done = EachPhysical<object>((i, h, name) =>
        {
            if (i != index) return null;
            if (!Native.GetMonitorBrightness(h, out var min, out var _cur, out var max)) throw new HelperException("That display doesn't accept brightness over DDC/CI.");
            var v = (uint)Math.Round(min + (max - min) * Protocol.ClampPercent(percent) / 100.0);
            if (!Native.SetMonitorBrightness(h, v)) throw new HelperException("The display refused the new brightness.");
            return new object();
        });
        if (done.Count == 0) throw new HelperException("That display isn't connected.");
    }

    public static void Lock()
    {
        if (!Native.LockWorkStation()) throw new HelperException("Windows refused to lock.");
    }

    public static void Sleep()
    {
        if (Native.SetSuspendState(0, 0, 0) == 0) throw new HelperException("Windows refused to sleep.");
    }
}
