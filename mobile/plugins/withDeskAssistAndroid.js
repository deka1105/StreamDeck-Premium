// Config plugin for the Android-only features:
//  1. MainActivity passes volume-key presses to the DeskAssist module first,
//     so (when turned on) they flip panel pages instead of changing volume.
//  2. MainActivity can be chosen as the home screen (kiosk). Android never
//     switches by itself; the user picks DeskAssist in Settings › Home app.
const { withMainActivity, withAndroidManifest } = require("expo/config-plugins");

const KEY_HOOK = `
  // DeskAssist: volume keys flip panel pages when the user turns it on.
  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (expo.modules.deskassistandroid.VolumeKeys.handle(event)) return true
    return super.dispatchKeyEvent(event)
  }
`;

function withVolumeKeys(config) {
  return withMainActivity(config, (c) => {
    let src = c.modResults.contents;
    if (!src.includes("VolumeKeys.handle")) {
      if (c.modResults.language !== "kt") throw new Error("withDeskAssistAndroid expects a Kotlin MainActivity.");
      src = src.replace(/class MainActivity : ReactActivity\(\) \{/, (m) => `${m}${KEY_HOOK}`);
      if (!src.includes("VolumeKeys.handle")) throw new Error("withDeskAssistAndroid: couldn't find the MainActivity class.");
    }
    c.modResults.contents = src;
    return c;
  });
}

function withHomeFilter(config) {
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$["android:name"] === ".MainActivity");
    if (!main) return c;
    main["intent-filter"] ??= [];
    const has = main["intent-filter"].some((f) => (f.category ?? []).some((x) => x.$["android:name"] === "android.intent.category.HOME"));
    if (!has) {
      main["intent-filter"].push({
        action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
        category: [{ $: { "android:name": "android.intent.category.HOME" } }, { $: { "android:name": "android.intent.category.DEFAULT" } }],
      });
    }
    return c;
  });
}

module.exports = function withDeskAssistAndroid(config) {
  return withHomeFilter(withVolumeKeys(config));
};
