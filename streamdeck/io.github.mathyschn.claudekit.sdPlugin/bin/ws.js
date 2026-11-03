// Client WebSocket minimal (RFC 6455), sans dépendance : juste ce qu'il faut pour parler
// à l'application Stream Deck sur 127.0.0.1 (texte, ping/pong, fermeture).
"use strict";
const net = require("net");
const crypto = require("crypto");
const { EventEmitter } = require("events");

function encodeFrame(opcode, payload, mask = true) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
  const len = data.length;
  const header = [0x80 | opcode];
  const maskBit = mask ? 0x80 : 0;
  if (len < 126) header.push(maskBit | len);
  else if (len < 65536) header.push(maskBit | 126, (len >> 8) & 255, len & 255);
  else {
    header.push(maskBit | 127, 0, 0, 0, 0);
    header.push((len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255);
  }
  if (!mask) return Buffer.concat([Buffer.from(header), data]);
  const key = crypto.randomBytes(4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ key[i % 4];
  return Buffer.concat([Buffer.from(header), key, masked]);
}

// Lit autant de trames complètes que possible dans `buf` ; renvoie { frames, rest }
function decodeFrames(buf) {
  const frames = [];
  let offset = 0;
  while (buf.length - offset >= 2) {
    const b0 = buf[offset];
    const b1 = buf[offset + 1];
    let len = b1 & 0x7f;
    let pos = offset + 2;
    if (len === 126) {
      if (buf.length < pos + 2) break;
      len = buf.readUInt16BE(pos);
      pos += 2;
    } else if (len === 127) {
      if (buf.length < pos + 8) break;
      len = Number(buf.readBigUInt64BE(pos));
      pos += 8;
    }
    const masked = (b1 & 0x80) !== 0;
    let key;
    if (masked) {
      if (buf.length < pos + 4) break;
      key = buf.subarray(pos, pos + 4);
      pos += 4;
    }
    if (buf.length < pos + len) break;
    let payload = Buffer.from(buf.subarray(pos, pos + len));
    if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= key[i % 4];
    frames.push({ fin: (b0 & 0x80) !== 0, opcode: b0 & 0x0f, payload });
    offset = pos + len;
  }
  return { frames, rest: buf.subarray(offset) };
}

class WebSocketClient extends EventEmitter {
  constructor(port, host = "127.0.0.1") {
    super();
    this.isOpen = false;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    const key = crypto.randomBytes(16).toString("base64");
    this.socket = net.connect(port, host, () => {
      this.socket.write(
        `GET / HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    let handshakeDone = false;
    this.socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (!handshakeDone) {
        const end = this.buffer.indexOf("\r\n\r\n");
        if (end < 0) return;
        const head = this.buffer.subarray(0, end).toString();
        if (!/^HTTP\/1\.1 101/.test(head)) {
          this.emit("error", new Error(`Handshake refusé : ${head.split("\r\n")[0]}`));
          this.socket.destroy();
          return;
        }
        handshakeDone = true;
        this.isOpen = true;
        this.buffer = this.buffer.subarray(end + 4);
        this.emit("open");
      }
      const { frames, rest } = decodeFrames(this.buffer);
      this.buffer = rest;
      for (const f of frames) this.handleFrame(f);
    });
    this.socket.on("close", () => {
      this.isOpen = false;
      this.emit("close");
    });
    this.socket.on("error", (err) => this.emit("error", err));
  }

  handleFrame(f) {
    if (f.opcode === 0x8) {
      this.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
      return;
    }
    if (f.opcode === 0x9) {
      this.socket.write(encodeFrame(0xa, f.payload));
      return;
    }
    if (f.opcode === 0x1 || f.opcode === 0x0) {
      this.fragments.push(f.payload);
      if (f.fin) {
        const text = Buffer.concat(this.fragments).toString("utf8");
        this.fragments = [];
        this.emit("message", text);
      }
    }
  }

  send(text) {
    if (this.isOpen) this.socket.write(encodeFrame(0x1, text));
  }

  close() {
    if (this.isOpen) this.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
  }
}

module.exports = { WebSocketClient, encodeFrame, decodeFrames };
