// UDP senders: Wake-on-LAN magic packets and OSC 1.0 messages.

import dgram from "node:dgram";

// ------------------------------------------------------------ Wake-on-LAN ----

/** "AA:BB:CC:DD:EE:FF" (or with -, or bare) → 6 bytes, or null. Pure. */
export function parseMac(mac) {
  const hex = String(mac ?? "").replace(/[^0-9a-f]/gi, "");
  if (hex.length !== 12 || !/^[0-9a-f]{12}$/i.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

/** The magic packet: 6 × 0xFF then the MAC 16 times (102 bytes). Pure. */
export function magicPacket(mac) {
  const m = parseMac(mac);
  if (!m) throw new Error("That isn't a MAC address (like 3C:22:FB:12:34:56).");
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(m)]);
}

function send(buf, { host, port, broadcast = false }) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket(host.includes(":") ? "udp6" : "udp4");
    sock.once("error", (err) => (sock.close(), reject(err)));
    sock.bind(0, () => {
      if (broadcast) sock.setBroadcast(true);
      sock.send(buf, port, host, (err) => {
        sock.close();
        err ? reject(err) : resolve();
      });
    });
  });
}

/** Send the packet three times (UDP may drop one). */
export async function wake({ mac, address = "255.255.255.255", port = 9 }) {
  const pkt = magicPacket(mac);
  for (let i = 0; i < 3; i++) await send(pkt, { host: address, port, broadcast: true });
}

// -------------------------------------------------------------------- OSC ----

const pad4 = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]); // always ≥1 NUL
const oscString = (s) => pad4(Buffer.from(String(s), "utf8"));

/**
 * Parse an argument line: numbers with a dot are floats, other numbers ints,
 * true / false booleans, "quoted" or bare words strings. Pure.
 */
export function parseOscArgs(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(/"([^"]*)"|(\S+)/g)) {
    if (m[1] !== undefined) out.push({ type: "s", value: m[1] });
    else if (/^-?\d+$/.test(m[2])) out.push({ type: "i", value: Number(m[2]) });
    else if (/^-?\d*\.\d+$/.test(m[2])) out.push({ type: "f", value: Number(m[2]) });
    else if (m[2] === "true" || m[2] === "false") out.push({ type: m[2] === "true" ? "T" : "F" });
    else out.push({ type: "s", value: m[2] });
  }
  return out.slice(0, 16);
}

/** Encode one OSC message. Pure. */
export function encodeOsc(address, args = []) {
  if (!/^\/[\x21-\x7e]*$/.test(address)) throw new Error("An OSC address starts with / and has no spaces.");
  const tags = `,${args.map((a) => a.type).join("")}`;
  const body = args.map((a) => {
    if (a.type === "i") {
      const b = Buffer.alloc(4);
      b.writeInt32BE(a.value | 0);
      return b;
    }
    if (a.type === "f") {
      const b = Buffer.alloc(4);
      b.writeFloatBE(a.value);
      return b;
    }
    if (a.type === "s") return oscString(a.value);
    return Buffer.alloc(0); // T / F carry no data
  });
  return Buffer.concat([oscString(address), oscString(tags), ...body]);
}

/** Decode one OSC message (tests). Pure. */
export function decodeOsc(buf) {
  let off = 0;
  const str = () => {
    const end = buf.indexOf(0, off);
    const s = buf.subarray(off, end).toString("utf8");
    off = end + 1;
    off += (4 - (off % 4)) % 4;
    return s;
  };
  const address = str();
  const tags = str().slice(1);
  const args = [];
  for (const t of tags) {
    if (t === "i") (args.push(buf.readInt32BE(off)), (off += 4));
    else if (t === "f") (args.push(Number(buf.readFloatBE(off).toFixed(5))), (off += 4));
    else if (t === "s") args.push(str());
    else if (t === "T") args.push(true);
    else if (t === "F") args.push(false);
  }
  return { address, args };
}

export async function sendOsc({ host, port, address, args }) {
  await send(encodeOsc(address, parseOscArgs(args)), { host: host || "127.0.0.1", port: Number(port) });
}
