// Windows Core Audio, DDC/CI and power declarations. Interface layouts follow
// Microsoft's published headers (mmdeviceapi.h, endpointvolume.h,
// audiopolicy.h, propsys.h, physicalmonitorenumerationapi.h,
// highlevelmonitorconfigurationapi.h). Methods are declared flat, in vtable
// order; "Gap" entries hold places we never call.
//
// IPolicyConfig (switching the default device) is the one interface Windows
// does not document. Its layout is widely described in public write-ups and is
// what the Sound control panel itself uses; if it ever fails we report that
// switching is unavailable rather than guess.

using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;

namespace DeskAssist.Helper;

internal static class Clsid
{
    public static readonly Guid MMDeviceEnumerator = new("BCDE0395-E52F-467C-8E3D-C4579291692E");
    public static readonly Guid PolicyConfigClient = new("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9");
}

internal static class Iid
{
    public static readonly Guid IMMDeviceEnumerator = new("A95664D2-9614-4F35-A746-DE8DB63617E6");
    public static readonly Guid IAudioEndpointVolume = new("5CDF2C82-841E-4546-9722-0CF74078229A");
    public static readonly Guid IAudioMeterInformation = new("C02216F6-8C67-4B5B-9D00-D008E73E0064");
    public static readonly Guid IAudioSessionManager2 = new("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    public static readonly Guid IPolicyConfig = new("F8679F50-850A-41CF-9C72-430F290290C8");
}

[StructLayout(LayoutKind.Sequential)]
internal struct PropertyKey
{
    public Guid fmtid;
    public uint pid;
}

// PROPVARIANT is 24 bytes on x64: a 2-byte type, 6 reserved bytes, a 16-byte union.
[StructLayout(LayoutKind.Sequential)]
internal struct PropVariant
{
    public ushort vt;
    public ushort r1, r2, r3;
    public IntPtr p;
    public IntPtr p2;
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
internal partial interface IMMDeviceEnumerator
{
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, uint stateMask, out IMMDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    [PreserveSig] int GetDevice(string id, out IMMDevice device);
}

[GeneratedComInterface]
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
internal partial interface IMMDeviceCollection
{
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IMMDevice device);
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
internal partial interface IMMDevice
{
    [PreserveSig] int Activate(in Guid iid, uint clsCtx, IntPtr activationParams, out IntPtr iface);
    [PreserveSig] int OpenPropertyStore(uint access, out IPropertyStore store);
    [PreserveSig] int GetId(out string id);
    [PreserveSig] int GetState(out uint state);
}

[GeneratedComInterface]
[Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
internal partial interface IPropertyStore
{
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetAt(uint index, out PropertyKey key);
    [PreserveSig] int GetValue(in PropertyKey key, out PropVariant value);
}

[GeneratedComInterface]
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
internal partial interface IAudioEndpointVolume
{
    [PreserveSig] int Gap1(); // RegisterControlChangeNotify
    [PreserveSig] int Gap2(); // UnregisterControlChangeNotify
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float db, in Guid ctx);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, in Guid ctx);
    [PreserveSig] int GetMasterVolumeLevel(out float db);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int Gap3(); // SetChannelVolumeLevel
    [PreserveSig] int Gap4(); // SetChannelVolumeLevelScalar
    [PreserveSig] int Gap5(); // GetChannelVolumeLevel
    [PreserveSig] int Gap6(); // GetChannelVolumeLevelScalar
    [PreserveSig] int SetMute(int mute, in Guid ctx);
    [PreserveSig] int GetMute(out int mute);
}

[GeneratedComInterface]
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
internal partial interface IAudioMeterInformation
{
    [PreserveSig] int GetPeakValue(out float peak);
}

[GeneratedComInterface]
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
internal partial interface IAudioSessionManager2
{
    [PreserveSig] int Gap1(); // GetAudioSessionControl
    [PreserveSig] int Gap2(); // GetSimpleAudioVolume
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
}

[GeneratedComInterface]
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
internal partial interface IAudioSessionEnumerator
{
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
internal partial interface IAudioSessionControl2
{
    // IAudioSessionControl
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName(out string name);
    [PreserveSig] int Gap1(); // SetDisplayName
    [PreserveSig] int Gap2(); // GetIconPath
    [PreserveSig] int Gap3(); // SetIconPath
    [PreserveSig] int Gap4(); // GetGroupingParam
    [PreserveSig] int Gap5(); // SetGroupingParam
    [PreserveSig] int Gap6(); // RegisterAudioSessionNotification
    [PreserveSig] int Gap7(); // UnregisterAudioSessionNotification
    // IAudioSessionControl2
    [PreserveSig] int GetSessionIdentifier(out string id);
    [PreserveSig] int GetSessionInstanceIdentifier(out string id);
    [PreserveSig] int GetProcessId(out uint pid);
    [PreserveSig] int IsSystemSoundsSession();
}

[GeneratedComInterface]
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8")]
internal partial interface ISimpleAudioVolume
{
    [PreserveSig] int SetMasterVolume(float level, in Guid ctx);
    [PreserveSig] int GetMasterVolume(out float level);
    [PreserveSig] int SetMute(int mute, in Guid ctx);
    [PreserveSig] int GetMute(out int mute);
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("F8679F50-850A-41CF-9C72-430F290290C8")]
internal partial interface IPolicyConfig
{
    [PreserveSig] int Gap1(); // GetMixFormat
    [PreserveSig] int Gap2(); // GetDeviceFormat
    [PreserveSig] int Gap3(); // ResetDeviceFormat
    [PreserveSig] int Gap4(); // SetDeviceFormat
    [PreserveSig] int Gap5(); // GetProcessingPeriod
    [PreserveSig] int Gap6(); // SetProcessingPeriod
    [PreserveSig] int Gap7(); // GetShareMode
    [PreserveSig] int Gap8(); // SetShareMode
    [PreserveSig] int Gap9(); // GetPropertyValue
    [PreserveSig] int Gap10(); // SetPropertyValue
    [PreserveSig] int SetDefaultEndpoint(string deviceId, int role);
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
internal unsafe struct PhysicalMonitor
{
    public IntPtr handle;
    public fixed char description[128];
}

internal static unsafe partial class Native
{
    public const uint CLSCTX_ALL = 23;
    public const int S_OK = 0;

    [LibraryImport("ole32.dll")]
    public static partial int CoInitializeEx(IntPtr reserved, uint coInit);

    [LibraryImport("ole32.dll")]
    public static partial int CoCreateInstance(in Guid clsid, IntPtr outer, uint ctx, in Guid iid, out IntPtr ppv);

    [LibraryImport("ole32.dll")]
    public static partial int PropVariantClear(ref PropVariant pv);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, delegate* unmanaged<IntPtr, IntPtr, IntPtr, IntPtr, int> callback, IntPtr data);

    [LibraryImport("dxva2.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr monitor, out uint count);

    [LibraryImport("dxva2.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GetPhysicalMonitorsFromHMONITOR(IntPtr monitor, uint count, PhysicalMonitor* monitors);

    [LibraryImport("dxva2.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool DestroyPhysicalMonitors(uint count, PhysicalMonitor* monitors);

    [LibraryImport("dxva2.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GetMonitorBrightness(IntPtr monitor, out uint min, out uint current, out uint max);

    [LibraryImport("dxva2.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool SetMonitorBrightness(IntPtr monitor, uint value);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool LockWorkStation();

    [LibraryImport("powrprof.dll")]
    public static partial byte SetSuspendState(byte hibernate, byte forceCritical, byte disableWakeEvent);
}
