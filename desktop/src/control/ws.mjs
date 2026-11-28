// A small RFC 6455 WebSocket client (text frames, ping/pong, close). The
// Electron host runs Node 20, where a global WebSocket needs a flag, and we
// keep the host free of extra dependencies. Also exports the frame helpers so
// tests can run a fake server with the same code.

import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { EventEmitter } from "node:events";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** The Sec-WebSocket-Accept value for a client key. */
export const acceptFor = (key) => createHash("sha1").update(key + GUID).digest("base64");

/** Encode one frame. Clients must mask; servers must not. */
export function encodeFrame(payload, { opcode = 1, mask = true } = {}) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const len = data.length;
  const head = [0x80 | opcode];
  if (len < 126) head.push((mask ? 0x80 : 0) | len);
  else if (len < 65536) head.push((mask ? 0x80 : 0) | 126, len >> 8, len & 255);
  else {
    head.push((mask ? 0x80 : 0) | 127, 0, 0, 0, 0);
    head.push((len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255);
  }
  if (!mask) return Buffer.concat([Buffer.from(head), data]);
  const key = randomBytes(4);
  const out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) out[i] = data[i] ^ key[i & 3];
  return Buffer.concat([Buffer.from(head), key, out]);
}

/**
 * Pull complete frames off the front of `buf`. Returns {frames, rest}.
 * Fragmented messages are joined by the caller.
 */
export function decodeFrames(buf) {
  const frames = [];
  let off = 0;
  while (buf.length - off >= 2) {
    const b0 = buf[off];
    const b1 = buf[off + 1];
    let len = b1 & 127;
    let p = off + 2;
    if (len === 126) {
      if (buf.length - p < 2) break;
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      if (buf.length - p < 8) break;
      len = Number(buf.readBigUInt64BE(p));
      p += 8;
    }
    const masked = (b1 & 0x80) !== 0;
    let key = null;
    if (masked) {
      if (buf.length - p < 4) break;
      key = buf.subarray(p, p + 4);
      p += 4;
    }
    if (buf.length - p < len) break;
    let data = Buffer.from(buf.subarray(p, p + len));
    if (key) for (let i = 0; i < len; i++) data[i] ^= key[i & 3];
    frames.push({ fin: (b0 & 0x80) !== 0, opcode: b0 & 15, data });
    off = p + len;
  }
  return { frames, rest: buf.subarray(off) };
}

/**
 * Connect to ws:// or wss://. Emits "open", "message" (string), "close"
 * ({code}), "error". `send(text)` and `close()`.
 */
export function connect(url, { protocols = [], timeoutMs = 5000 } = {}) {
  const u = new URL(url);
  const secure = u.protocol === "wss:";
  const port = Number(u.port) || (secure ? 443 : 80);
  const ev = new EventEmitter();
  const key = randomBytes(16).toString("base64");
  const sock = secure ? tls.connect({ host: u.hostname, port, servername: u.hostname }) : net.connect({ host: u.hostname, port });
  let open = false;
  let closed = false;
  let buf = Buffer.alloc(0);
  let parts = [];
  const timer = setTimeout(() => fail(new Error(`No answer from ${u.host}.`)), timeoutMs);

  function fail(err) {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    sock.destroy();
    ev.emit("error", err);
    ev.emit("close", { code: 1006 });
  }

  sock.once(secure ? "secureConnect" : "connect", () => {
    const lines = [
      `GET ${u.pathname || "/"}${u.search} HTTP/1.1`,
      `Host: ${u.host}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${key}`,
      "Sec-WebSocket-Version: 13",
    ];
    if (protocols.length) lines.push(`Sec-WebSocket-Protocol: ${protocols.join(", ")}`);
    sock.write(`${lines.join("\r\n")}\r\n\r\n`);
  });
  sock.on("error", (err) => fail(err.code === "ECONNREFUSED" ? new Error(`Nothing is listening on ${u.host}.`) : err));
  sock.on("close", () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    ev.emit("close", { code: 1006 });
  });
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!open) {
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      const head = buf.subarray(0, end).toString("latin1");
      buf = buf.subarray(end + 4);
      const status = Number(head.split(" ")[1]);
      const accept = /\r\nsec-websocket-accept:\s*(\S+)/i.exec(head)?.[1];
      if (status !== 101 || accept !== acceptFor(key)) return fail(new Error(`Not a WebSocket server (HTTP ${status || "?"}).`));
      open = true;
      clearTimeout(timer);
      ev.emit("open");
    }
    const { frames, rest } = decodeFrames(buf);
    buf = rest;
    for (const f of frames) {
      if (f.opcode === 8) {
        const code = f.data.length >= 2 ? f.data.readUInt16BE(0) : 1005;
        if (!closed) sock.end(encodeFrame(f.data.subarray(0, 2), { opcode: 8 }));
        closed = true;
        ev.emit("close", { code });
        continue;
      }
      if (f.opcode === 9) {
        sock.write(encodeFrame(f.data, { opcode: 10 }));
        continue;
      }
      if (f.opcode === 10) continue;
      parts.push(f.data);
      if (f.fin) {
        const msg = Buffer.concat(parts).toString("utf8");
        parts = [];
        ev.emit("message", msg);
      }
    }
  });

  ev.send = (text) => {
    if (!open || closed) throw new Error("Not connected.");
    sock.write(encodeFrame(text));
  };
  ev.close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    try {
      if (open) sock.end(encodeFrame(Buffer.from([0x03, 0xe8]), { opcode: 8 }));
      else sock.destroy();
    } catch {
      sock.destroy();
    }
    ev.emit("close", { code: 1000 });
  };
  ev.get = () => ({ open, closed });
  return ev;
}

/** Accept an upgrade on an http.Server (tests / fixtures). Returns a socket-like emitter. */
export function acceptUpgrade(req, socket) {
  const key = req.headers["sec-websocket-key"];
  const proto = String(req.headers["sec-websocket-protocol"] ?? "").split(",")[0].trim();
  socket.write(
    ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${acceptFor(key)}`, ...(proto ? [`Sec-WebSocket-Protocol: ${proto}`] : [])].join("\r\n") + "\r\n\r\n",
  );
  const ev = new EventEmitter();
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const { frames, rest } = decodeFrames(buf);
    buf = rest;
    for (const f of frames) {
      if (f.opcode === 8) {
        socket.end();
        ev.emit("close");
      } else if (f.opcode === 1) ev.emit("message", f.data.toString("utf8"));
    }
  });
  socket.on("error", () => {});
  socket.on("close", () => ev.emit("close"));
  ev.send = (text) => socket.write(encodeFrame(text, { mask: false }));
  ev.close = () => socket.end(encodeFrame(Buffer.from([0x03, 0xe8]), { opcode: 8, mask: false }));
  return ev;
}
