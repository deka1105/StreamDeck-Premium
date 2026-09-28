#!/usr/bin/env node
// Preflight for macOS distribution builds.
//
// Why this exists: electron-builder picks the first usable codesigning identity
// in the keychain when `mac.identity` isn't pinned. On this machine that was an
// *Apple Development* certificate, which produces a build that looks successful
// but cannot launch on any Mac — Gatekeeper only accepts "Developer ID
// Application" + notarization for apps distributed outside the App Store.
// DeskAssist 0.1.0 shipped that way and the failure was silent.
//
// Run directly for a report:      npm run check:signing
// Gate a release build on it:     npm run dist:mac:release
//
// Never prints secret values — only whether each one is present.

import { execFileSync } from "node:child_process";

const strict = process.argv.includes("--strict");

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m";
const DIM = "\x1b[2m", BOLD = "\x1b[1m", OFF = "\x1b[0m";
const ok = (m) => console.log(`  ${GREEN}✓${OFF} ${m}`);
const bad = (m) => console.log(`  ${RED}✗${OFF} ${m}`);
const warn = (m) => console.log(`  ${YELLOW}!${OFF} ${m}`);

if (process.platform !== "darwin") {
  console.log("check:signing — not macOS, nothing to check.");
  process.exit(0);
}

function identities() {
  let out = "";
  try {
    out = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
      encoding: "utf8",
    });
  } catch {
    return [];
  }
  // lines look like:  1) <SHA1> "Developer ID Application: Name (TEAMID)"
  return [...out.matchAll(/^\s*\d+\)\s+([0-9A-F]{40})\s+"(.+)"\s*$/gim)].map((m) => ({
    sha1: m[1],
    name: m[2],
  }));
}

// What each certificate type is actually good for.
function classify(name) {
  if (name.startsWith("Developer ID Application:"))
    return { usable: true, why: "valid for direct distribution (Gatekeeper + notarization)" };
  if (name.startsWith("Developer ID Installer:"))
    return { usable: false, why: "signs .pkg installers only, not .app bundles" };
  if (name.startsWith("Apple Distribution:"))
    return { usable: false, why: "App Store / TestFlight submission only — Gatekeeper rejects it for direct download" };
  if (name.startsWith("Apple Development:") || name.startsWith("Mac Developer:"))
    return { usable: false, why: "development only — produces an app that will not launch when distributed" };
  if (name.startsWith("3rd Party Mac Developer"))
    return { usable: false, why: "Mac App Store submission only" };
  return { usable: false, why: "unrecognized certificate type" };
}

let releaseReady = true;

console.log(`\n${BOLD}macOS signing preflight${OFF}\n`);

// ---------------------------------------------------------------- certificates
console.log(`${BOLD}Certificates${OFF}`);
const ids = identities();
if (ids.length === 0) {
  bad("no codesigning identities in the keychain at all");
  releaseReady = false;
} else {
  for (const { name } of ids) {
    const { usable, why } = classify(name);
    (usable ? ok : warn)(`${name}\n      ${DIM}${why}${OFF}`);
  }
}

const devIds = ids.filter((i) => i.name.startsWith("Developer ID Application:"));
console.log("");
if (devIds.length === 0) {
  bad(`${BOLD}No "Developer ID Application" certificate.${OFF} This is the blocker.`);
  releaseReady = false;
} else {
  ok(`Developer ID Application present: ${devIds.map((d) => d.name).join(", ")}`);
  if (devIds.length > 1)
    warn('more than one — pin the exact string in package.json → build.mac.identity');
}

// -------------------------------------------------------- notarization secrets
console.log(`\n${BOLD}Notarization credentials${OFF} ${DIM}(read by build/notarize.cjs)${OFF}`);
const env = process.env;
const hasPw = !!(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
const hasKey = !!(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER);

if (hasPw) ok("Apple ID + app-specific password + team ID are set");
else if (hasKey) ok("App Store Connect API key, key ID and issuer are set");
else {
  bad("neither credential set is present — notarization will be SKIPPED");
  releaseReady = false;
  console.log(
    `      ${DIM}option A: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID` +
      `\n      option B: APPLE_API_KEY (path to .p8), APPLE_API_KEY_ID, APPLE_API_ISSUER${OFF}`,
  );
}
if (hasPw || hasKey) {
  for (const [k, v] of Object.entries({
    APPLE_ID: env.APPLE_ID, APPLE_TEAM_ID: env.APPLE_TEAM_ID,
    APPLE_API_KEY: env.APPLE_API_KEY, APPLE_API_KEY_ID: env.APPLE_API_KEY_ID,
  })) {
    if (!v) continue;
    // APPLE_ID is an email and APPLE_API_KEY a file path; neither is a secret.
    // The password / .p8 contents are never read or printed.
    console.log(`      ${DIM}${k}=${v}${OFF}`);
  }
  if (env.APPLE_TEAM_ID && !/^[A-Z0-9]{10}$/.test(env.APPLE_TEAM_ID))
    warn(`APPLE_TEAM_ID "${env.APPLE_TEAM_ID}" is not a 10-character Team ID`);
  if (env.APPLE_API_KEY) {
    try {
      execFileSync("test", ["-f", env.APPLE_API_KEY]);
      ok(`API key file exists`);
    } catch {
      bad(`APPLE_API_KEY points at a missing file: ${env.APPLE_API_KEY}`);
      releaseReady = false;
    }
  }
}

// ------------------------------------------------------------------- hardening
console.log(`\n${BOLD}Build config${OFF}`);
const { default: pkg } = await import("../package.json", { with: { type: "json" } });
const mac = pkg.build?.mac ?? {};
mac.hardenedRuntime === true
  ? ok("hardenedRuntime: true (required for notarization)")
  : bad("hardenedRuntime must be true or notarization will fail");
mac.entitlements ? ok(`entitlements: ${mac.entitlements}`) : warn("no entitlements file set");
pkg.build?.afterSign
  ? ok(`afterSign hook: ${pkg.build.afterSign}`)
  : bad("no afterSign hook — nothing will notarize");
mac.identity === undefined
  ? warn("build.mac.identity is not pinned — electron-builder will choose for you")
  : ok(`identity pinned: ${mac.identity === null ? "null (unsigned)" : mac.identity}`);

// ---------------------------------------------------------------------- result
console.log("");
if (releaseReady) {
  console.log(`${GREEN}${BOLD}Release-ready.${OFF} A build now will be Developer ID signed and notarized.`);
  console.log(`${DIM}Verify the artifact afterwards:`);
  console.log(`  spctl -a -vvv -t exec "dist/mac/DeskAssist.app"   # expect: accepted, source=Notarized Developer ID`);
  console.log(`  xcrun stapler validate "dist/mac/DeskAssist.app"  # expect: The validate action worked!${OFF}`);
} else {
  console.log(`${RED}${BOLD}Not release-ready.${OFF} A build now would produce an app that cannot be launched`);
  console.log(`by anyone who downloads it. See "Code signing" in desktop/README.md.`);
  if (devIds.length === 0) {
    console.log(`\n${BOLD}To create the missing certificate${OFF} (only the Account Holder can):`);
    console.log(`  1. Keychain Access → Certificate Assistant → Request a Certificate`);
    console.log(`     From a Certificate Authority → save the CSR to disk.`);
    console.log(`  2. developer.apple.com → Certificates, Identifiers & Profiles → Certificates`);
    console.log(`     → + → "Developer ID Application" → upload the CSR.`);
    console.log(`  3. Download the .cer and double-click to install it.`);
    console.log(`  4. Re-run: npm run check:signing`);
  }
}
console.log("");

process.exit(strict && !releaseReady ? 1 : 0);
