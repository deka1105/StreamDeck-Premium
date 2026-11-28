// Our own small translation layer: key-based dictionaries, English fallback,
// {name} placeholders, and right-to-left for Arabic. Locales arrive in
// batches; a missing key falls back to English, never to a blank.

export const LOCALES = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ar: "العربية",
};
const RTL = new Set(["ar"]);

const DICT = {
  en: {
    "status.waiting": "Waiting for your computer…",
    "banner.demo": "Simulated — demo data",
    "status.connected": "Connected",
    "status.offline": "Offline",
    "widget.failed": "This widget failed to load.",
    "switch.stay": "Stay",
    "switch.go": "Go now",
    "switch.to": "Switching to {page} in {n}…",
    "prompt.allow": "Allow",
    "prompt.deny": "Deny",
    "prompt.left": "Asks in the terminal in {n} s",
    "night.tap": "Tap to wake",
    "hold.confirm": "Hold to confirm",
    "common.none": "Nothing yet.",
  },
  es: {
    "status.waiting": "Esperando a tu ordenador…",
    "banner.demo": "Simulado: datos de demostración",
    "status.connected": "Conectado",
    "status.offline": "Sin conexión",
    "widget.failed": "Este widget no se pudo cargar.",
    "switch.stay": "Quedarse",
    "switch.go": "Ir ahora",
    "switch.to": "Cambiando a {page} en {n}…",
    "prompt.allow": "Permitir",
    "prompt.deny": "Denegar",
    "prompt.left": "Preguntará en la terminal en {n} s",
    "night.tap": "Toca para despertar",
    "hold.confirm": "Mantén pulsado para confirmar",
    "common.none": "Nada todavía.",
  },
  fr: {
    "status.waiting": "En attente de votre ordinateur…",
    "banner.demo": "Simulé — données de démonstration",
    "status.connected": "Connecté",
    "status.offline": "Hors ligne",
    "widget.failed": "Ce widget n’a pas pu se charger.",
    "switch.stay": "Rester",
    "switch.go": "Y aller",
    "switch.to": "Passage à {page} dans {n}…",
    "prompt.allow": "Autoriser",
    "prompt.deny": "Refuser",
    "prompt.left": "Demandera dans le terminal dans {n} s",
    "night.tap": "Touchez pour réveiller",
    "hold.confirm": "Maintenez pour confirmer",
    "common.none": "Rien pour l’instant.",
  },
  de: {
    "status.waiting": "Warte auf deinen Computer…",
    "banner.demo": "Simuliert – Demodaten",
    "status.connected": "Verbunden",
    "status.offline": "Offline",
    "widget.failed": "Dieses Widget konnte nicht geladen werden.",
    "switch.stay": "Bleiben",
    "switch.go": "Jetzt wechseln",
    "switch.to": "Wechsel zu {page} in {n}…",
    "prompt.allow": "Erlauben",
    "prompt.deny": "Ablehnen",
    "prompt.left": "Fragt in {n} s im Terminal",
    "night.tap": "Zum Aufwecken tippen",
    "hold.confirm": "Zum Bestätigen halten",
    "common.none": "Noch nichts.",
  },
  ar: {
    "status.waiting": "في انتظار حاسوبك…",
    "banner.demo": "محاكاة — بيانات تجريبية",
    "status.connected": "متصل",
    "status.offline": "غير متصل",
    "widget.failed": "تعذّر تحميل هذه الأداة.",
    "switch.stay": "البقاء",
    "switch.go": "انتقل الآن",
    "switch.to": "الانتقال إلى {page} خلال {n}…",
    "prompt.allow": "سماح",
    "prompt.deny": "رفض",
    "prompt.left": "سيُسأل في الطرفية خلال {n} ث",
    "night.tap": "المس للتنبيه",
    "hold.confirm": "اضغط مطولاً للتأكيد",
    "common.none": "لا شيء بعد.",
  },
};

let locale = "en";

/** Pick a supported locale from a setting ("auto" = the device language). Pure. */
export function resolveLocale(setting, navigatorLanguage = "en") {
  const want = !setting || setting === "auto" ? String(navigatorLanguage) : String(setting);
  const base = want.toLowerCase().split(/[-_]/)[0];
  return DICT[base] ? base : "en";
}

export function setLocale(setting, doc = typeof document !== "undefined" ? document : null) {
  locale = resolveLocale(setting, typeof navigator !== "undefined" ? navigator.language : "en");
  if (doc) {
    doc.documentElement.lang = locale;
    doc.documentElement.dir = RTL.has(locale) ? "rtl" : "ltr";
  }
  return locale;
}

export const getLocale = () => locale;
export const isRtl = (l = locale) => RTL.has(l);

/** Translate a key with {placeholders}; falls back to English, then the key. Pure given the locale. */
export function t(key, vars = {}, l = locale) {
  const s = DICT[l]?.[key] ?? DICT.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

/** Keys that some locale lacks (for tests and for the next translation batch). */
export function missingKeys() {
  const keys = Object.keys(DICT.en);
  return Object.fromEntries(Object.keys(DICT).map((l) => [l, keys.filter((k) => !(k in DICT[l]))]));
}
