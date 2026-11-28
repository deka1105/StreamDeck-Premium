// A small MQTT 3.1.1 client (CONNECT, SUBSCRIBE, PUBLISH QoS 0, PINGREQ),
// over TLS or plain TCP. Enough for a printer's LAN status feed; written from
// the OASIS MQTT 3.1.1 specification. Also exports the packet helpers so
// tests can run a fake broker.

import net from "node:net";
import tls from "node:tls";
import { EventEmitter } from "node:events";

const enc = (s) => {
  const b = Buffer.from(String(s), "utf8");
  return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]);
};

/** Remaining-length varint. Pure. */
export function varint(n) {
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    out.push(byte);
  } while (n > 0);
  return Buffer.from(out);
}

export const packet = (type, flags, body) => Buffer.concat([Buffer.from([(type << 4) | flags]), varint(body.length), body]);

export function connectPacket({ clientId, username, password, keepalive = 30 }) {
  let flags = 2; // clean session
  if (username) flags |= 128;
  if (password) flags |= 64;
  const body = Buffer.concat([enc("MQTT"), Buffer.from([4, flags, keepalive >> 8, keepalive & 255]), enc(clientId), username ? enc(username) : Buffer.alloc(0), password ? enc(password) : Buffer.alloc(0)]);
  return packet(1, 0, body);
}

export const subscribePacket = (id, topic) => packet(8, 2, Buffer.concat([Buffer.from([id >> 8, id & 255]), enc(topic), Buffer.from([0])]));
export const publishPacket = (topic, payload) => packet(3, 0, Buffer.concat([enc(topic), Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload))]));

/** Split complete packets off a buffer. Returns {packets:[{type, flags, body}], rest}. Pure. */
export function readPackets(buf) {
  const packets = [];
  let off = 0;
  while (buf.length - off >= 2) {
    let mult = 1;
    let len = 0;
    let i = off + 1;
    let byte;
    do {
      if (i >= buf.length) return { packets, rest: buf.subarray(off) };
      byte = buf[i++];
      len += (byte & 127) * mult;
      mult *= 128;
    } while (byte & 128);
    if (buf.length - i < len) break;
    packets.push({ type: buf[off] >> 4, flags: buf[off] & 15, body: buf.subarray(i, i + len) });
    off = i + len;
  }
  return { packets, rest: buf.subarray(off) };
}

/** Topic and payload of a PUBLISH body (QoS 0). Pure. */
export function parsePublish(body, flags = 0) {
  const tl = body.readUInt16BE(0);
  const topic = body.subarray(2, 2 + tl).toString("utf8");
  const qos = (flags >> 1) & 3;
  const start = 2 + tl + (qos > 0 ? 2 : 0);
  return { topic, payload: body.subarray(start) };
}

/**
 * Connect. Emits "connect", "message" (topic, Buffer), "error", "close".
 * Options: host, port, username, password, tls (default true), insecure (accept a self-signed printer certificate).
 */
export function mqttConnect({ host, port = 8883, username, password, clientId = `deskassist-${Math.random().toString(16).slice(2, 10)}`, useTls = true, insecure = true, keepalive = 30, timeoutMs = 8000 }) {
  const ev = new EventEmitter();
  const sock = useTls ? tls.connect({ host, port, rejectUnauthorized: !insecure, servername: host }) : net.connect({ host, port });
  let buf = Buffer.alloc(0);
  let ready = false;
  let closed = false;
  let pkId = 1;
  let ping = null;
  const timer = setTimeout(() => fail(new Error(`No answer from ${host}:${port}.`)), timeoutMs);

  function fail(err) {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    clearInterval(ping);
    sock.destroy();
    ev.emit("error", err);
    ev.emit("close");
  }

  sock.once(useTls ? "secureConnect" : "connect", () => sock.write(connectPacket({ clientId, username, password, keepalive })));
  sock.on("error", (err) => fail(err.code === "ECONNREFUSED" ? new Error(`Nothing is listening on ${host}:${port}.`) : err));
  sock.on("close", () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    clearInterval(ping);
    ev.emit("close");
  });
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const { packets, rest } = readPackets(buf);
    buf = rest;
    for (const p of packets) {
      if (p.type === 2) {
        const code = p.body[1];
        if (code !== 0) return fail(new Error(code === 4 || code === 5 ? "The printer refused the access code." : `The printer refused the connection (code ${code}).`));
        ready = true;
        clearTimeout(timer);
        ping = setInterval(() => sock.write(packet(12, 0, Buffer.alloc(0))), (keepalive * 1000) / 2);
        ping.unref?.();
        ev.emit("connect");
      } else if (p.type === 3) {
        const { topic, payload } = parsePublish(p.body, p.flags);
        ev.emit("message", topic, payload);
      }
    }
  });

  ev.subscribe = (topic) => ready && sock.write(subscribePacket(pkId++, topic));
  ev.publish = (topic, payload) => ready && sock.write(publishPacket(topic, payload));
  ev.end = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    clearInterval(ping);
    try {
      sock.end(packet(14, 0, Buffer.alloc(0)));
    } catch {
      sock.destroy();
    }
    ev.emit("close");
  };
  return ev;
}
