// The Android-only native module. On iOS (and in builds without it) this is
// null, and every Android feature stays hidden — the platform gate.
import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

export type DeskAssistAndroid = {
  setVolumeKeyPaging(on: boolean): void;
  isDefaultHome(): boolean;
  openHomeSettings(): void;
  setImmersive(on: boolean): void;
  setPinned(on: boolean): void;
  setKeepScreenOn(on: boolean): void;
  setWindowBrightness(value: number): void;
  hasSensor(kind: "light" | "proximity"): boolean;
  setLightUpdates(on: boolean): void;
  setProximityUpdates(on: boolean): void;
  batteryTemperature(): number | null;
  getClipboard(): string;
  setClipboard(text: string): void;
  notificationAccess(): boolean;
  openNotificationAccess(): void;
  setNotificationMirror(on: boolean): void;
  addListener(event: "onVolumeKey", fn: (e: { direction: "up" | "down" }) => void): { remove(): void };
  addListener(event: "onNotification", fn: (e: { app: string; pkg: string; title: string; text: string; at: number }) => void): { remove(): void };
  addListener(event: "onLight", fn: (e: { lux: number }) => void): { remove(): void };
  addListener(event: "onProximity", fn: (e: { near: boolean }) => void): { remove(): void };
};

function load(): DeskAssistAndroid | null {
  if (Platform.OS !== "android") return null;
  try {
    return requireNativeModule<DeskAssistAndroid>("DeskAssistAndroid");
  } catch {
    return null;
  }
}

const native = load();
export default native;
