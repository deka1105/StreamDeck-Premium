# Reply — Submission 0f75f483-27cc-4ed3-87e7-fa8ece3a07cc

Both items are fixed in build 7. Paste into the Resolution Center reply box.

---

Hello,

Thank you for the detailed review. Both issues are fixed in build 7, now
uploaded.

**Guideline 2.3.8 — placeholder icons**

You were right. The icon in build 6 was the Expo template default that arrived
with the project scaffold, and it still carried the template's design guide
lines. Our intended icon had been designed but the iOS asset catalogue was
generated before that change and never refreshed, so the placeholder shipped.

Build 7 contains the final icon — a nine-tile deck mark on a blue gradient — and
it is now the same artwork everywhere: the app binary, the App Store listing, the
macOS companion app, and our website. Users searching their device will see the
same mark they saw on the store.

**Guideline 5.1.1(iv) — camera permission request**

Fixed exactly as directed. The button ahead of the system prompt now reads
**"Continue"** rather than "Grant camera access", so it describes the next step
instead of suggesting an answer. The explanatory line is now neutral and purely
factual: "Pairing reads a QR code shown by the desktop app."

We have also added the fallback you suggested. If camera access is unavailable
and iOS will no longer show the prompt, the screen now explains this and links
straight to Settings, so the feature is never silently unreachable.

Separately, camera access is not required to use the app. The first screen
offers **"Explore the demo instead"**, which runs the entire app against a
simulated Mac with no camera, no pairing and no network. Reviewers can exercise
every feature through it.

Thank you again for catching the icon — it would have been a poor first
impression for users.

Best regards,
