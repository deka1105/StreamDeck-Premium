// electron-builder afterSign hook — notarizes the macOS .app with Apple's
// notarytool.
//
// Accepts either credential style:
//   A) APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
//   B) APPLE_API_KEY (path to the .p8) + APPLE_API_KEY_ID + APPLE_API_ISSUER
//
// When neither is present it skips — but LOUDLY. An earlier version printed a
// single quiet line, and DeskAssist 0.1.0 shipped signed with an *Apple
// Development* certificate and no notarization ticket: a build that looked
// successful and could not launch on any Mac. The warnings below exist so that
// cannot happen quietly again. See `npm run check:signing`.

const { execFileSync, spawnSync } = require("node:child_process");

function box(lines) {
  const w = Math.max(...lines.map((l) => l.length));
  const bar = "─".repeat(w + 2);
  console.log(`\n  ┌${bar}┐`);
  for (const l of lines) console.log(`  │ ${l.padEnd(w)} │`);
  console.log(`  └${bar}┘\n`);
}

// Which certificate actually signed the bundle? An Apple Development or Apple
// Distribution cert cannot be notarized and will not pass Gatekeeper.
function signingAuthority(appPath) {
  try {
    const out = execFileSync("codesign", ["-dvv", appPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const m = out.match(/^Authority=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch (err) {
    const text = `${err.stdout || ""}${err.stderr || ""}`;
    const m = text.match(/^Authority=(.+)$/m);
    return m ? m[1].trim() : null;
  }
}

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  const {
    APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD,
    APPLE_TEAM_ID,
    APPLE_API_KEY,
    APPLE_API_KEY_ID,
    APPLE_API_ISSUER,
  } = process.env;

  const hasPw = APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID;
  const hasKey = APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER;

  // Warn about the certificate regardless of whether we're about to notarize:
  // the wrong cert is the failure that actually bit us.
  const authority = signingAuthority(appPath);
  const isDeveloperId = !!authority && authority.startsWith("Developer ID Application:");

  if (authority && !isDeveloperId) {
    box([
      "SIGNED WITH THE WRONG CERTIFICATE",
      "",
      `authority: ${authority}`,
      "",
      "Only a \"Developer ID Application\" certificate can be notarized and",
      "accepted by Gatekeeper for apps distributed outside the App Store.",
      "This build will NOT launch for anyone who downloads it.",
      "",
      "Pin the right one in package.json → build.mac.identity,",
      "then: npm run check:signing",
    ]);
  }

  if (!hasPw && !hasKey) {
    box([
      "NOTARIZATION SKIPPED — no Apple credentials in the environment",
      "",
      "Set one of:",
      "  APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID",
      "  APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER",
      "",
      "Without a notarization ticket macOS refuses the app on first",
      "launch. Fine for local development; never ship it.",
      "",
      "Details: npm run check:signing",
    ]);
    return;
  }

  if (!isDeveloperId) {
    // Notarytool would reject this anyway; fail the build with a clear reason
    // rather than burning a few minutes on an upload that cannot succeed.
    throw new Error(
      `Refusing to notarize ${appName}.app: it is signed by "${authority ?? "nothing"}", ` +
        `not a "Developer ID Application" certificate. Run: npm run check:signing`,
    );
  }

  const { notarize } = require("@electron/notarize");

  console.log(`  • notarizing ${appName}.app (this usually takes 2-5 minutes)…`);
  await notarize(
    hasKey
      ? {
          tool: "notarytool",
          appPath,
          appleApiKey: APPLE_API_KEY,
          appleApiKeyId: APPLE_API_KEY_ID,
          appleApiIssuer: APPLE_API_ISSUER,
        }
      : {
          tool: "notarytool",
          appPath,
          appleId: APPLE_ID,
          appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
          teamId: APPLE_TEAM_ID,
        },
  );
  console.log("  • notarization complete");

  // electron-builder staples for us, but confirm — an unstapled app still
  // needs a network round-trip on first launch, and fails offline.
  try {
    execFileSync("xcrun", ["stapler", "validate", appPath], { stdio: "pipe" });
    console.log("  • notarization ticket stapled");
  } catch {
    console.log("  ! ticket not stapled yet — electron-builder staples during packaging");
  }
};
