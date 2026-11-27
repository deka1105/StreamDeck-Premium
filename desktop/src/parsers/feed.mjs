// RSS 2.0 / RSS 1.0 (RDF) / Atom feed parsing, OPML import and a plain-text
// bulk format. Tolerant, dependency-free, written from the public specs.

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

/** Strip tags and collapse whitespace (titles sometimes carry markup). */
export function plain(s) {
  return decodeEntities(String(s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (xml, name) => {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "i").exec(xml);
  return m ? m[1] : null;
};
const blocks = (xml, name) => [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>[\\s\\S]*?</(?:[\\w-]+:)?${name}>`, "gi"))].map((m) => m[0]);
const attr = (el, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(el);
  return m ? decodeEntities(m[2] ?? m[3]) : null;
};

function safeLink(href) {
  try {
    const u = new URL(String(href ?? "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Parse a feed document into {title, items[{title, link, at}]}. */
export function parseFeed(xml) {
  const doc = String(xml ?? "");
  const isAtom = /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(doc) || (/<feed\b/i.test(doc) && /<entry\b/i.test(doc));
  if (isAtom) {
    const head = doc.split(/<entry\b/i)[0];
    return {
      title: plain(tag(head, "title")),
      items: blocks(doc, "entry").map((e) => {
        const links = [...e.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
        const alt = links.find((l) => !attr(l, "rel") || attr(l, "rel") === "alternate") ?? links[0];
        const when = tag(e, "published") ?? tag(e, "updated");
        return { title: plain(tag(e, "title")), link: safeLink(alt ? attr(alt, "href") : null), at: when ? Date.parse(plain(when)) || null : null };
      }),
    };
  }
  const channel = tag(doc, "channel") ?? doc;
  const head = channel.split(/<item\b/i)[0];
  return {
    title: plain(tag(head, "title")),
    items: blocks(doc, "item").map((it) => {
      const when = tag(it, "pubDate") ?? tag(it, "date") ?? tag(it, "updated");
      const link = tag(it, "link") ?? attr(it.match(/<item\b[^>]*>/i)?.[0] ?? "", "rdf:about") ?? tag(it, "guid");
      return { title: plain(tag(it, "title")), link: safeLink(plain(link)), at: when ? Date.parse(plain(when)) || null : null };
    }),
  };
}

/** OPML → [{name, url, category}]; nested outlines give their text as the category. */
export function parseOpml(xml) {
  const out = [];
  const doc = String(xml ?? "");
  const stack = [];
  for (const m of doc.matchAll(/<outline\b[^>]*?(\/?)>|<\/outline>/gi)) {
    const t = m[0];
    if (t.startsWith("</")) {
      stack.pop();
      continue;
    }
    const url = attr(t, "xmlUrl");
    const name = attr(t, "title") ?? attr(t, "text") ?? "";
    if (url) {
      const u = safeLink(url);
      if (u) out.push({ name: name || new URL(u).hostname, url: u, category: attr(t, "category")?.split("/").filter(Boolean).pop() ?? stack.filter(Boolean).at(-1) ?? "" });
    }
    if (!m[1] && !t.endsWith("/>")) stack.push(url ? null : name);
  }
  return out;
}

/** Lines of "Category | Name | URL" or "Name | URL" or just "URL". */
export function parseBulk(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    const url = safeLink(parts.at(-1));
    if (!url) continue;
    const name = parts.length >= 2 ? parts.at(-2) : new URL(url).hostname;
    const category = parts.length >= 3 ? parts[0] : "";
    out.push({ name, url, category });
  }
  return out;
}
