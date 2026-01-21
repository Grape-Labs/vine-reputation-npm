// src/index.ts
import bs58 from "bs58";
import { Buffer } from "buffer";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";

// ../../node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// ../../node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// ../../node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());

// ../../node_modules/@noble/hashes/esm/sha256.js
var sha2562 = sha256;

// src/index.ts
var VINE_REP_PROGRAM_ID = new PublicKey(
  "V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX"
);
function utf8(s) {
  return new TextEncoder().encode(s);
}
function toU8(data) {
  return data instanceof Buffer ? new Uint8Array(data) : data;
}
function u8eq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function u16le(n) {
  const b = new Uint8Array(2);
  b[0] = n & 255;
  b[1] = n >>> 8 & 255;
  return b;
}
function u32le(n) {
  const b = new Uint8Array(4);
  b[0] = n & 255;
  b[1] = n >>> 8 & 255;
  b[2] = n >>> 16 & 255;
  b[3] = n >>> 24 & 255;
  return b;
}
function u64le(n) {
  const b = new Uint8Array(8);
  let x = BigInt(n);
  for (let i = 0; i < 8; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}
function encodeAnchorString(s) {
  const bytes = utf8(s ?? "");
  return { len: u32le(bytes.length), bytes };
}
function readU16LE(buf, offset) {
  if (offset + 2 > buf.length) throw new RangeError("u16 out of bounds");
  return buf[offset] | buf[offset + 1] << 8;
}
function readU32LE(buf, offset) {
  if (offset + 4 > buf.length) throw new RangeError("u32 out of bounds");
  return (buf[offset] | buf[offset + 1] << 8 | buf[offset + 2] << 16 | buf[offset + 3] << 24) >>> 0;
}
function readU64LE(buf, offset) {
  if (offset + 8 > buf.length) throw new RangeError("u64 out of bounds");
  let x = 0n;
  for (let i = 7; i >= 0; i--) x = (x << 8n) + BigInt(buf[offset + i]);
  return x;
}
function getConfigPda(daoId, programId = VINE_REP_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([utf8("config"), daoId.toBytes()], programId);
}
function getProjectMetaPda(daoId, programId = VINE_REP_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [utf8("project_meta"), daoId.toBytes()],
    programId
  );
}
function getReputationPda(configPda, user, season, programId = VINE_REP_PROGRAM_ID) {
  const seasonSeed = u16le(season & 65535);
  return PublicKey.findProgramAddressSync(
    [utf8("reputation"), configPda.toBytes(), user.toBytes(), seasonSeed],
    programId
  );
}
var discCache = /* @__PURE__ */ new Map();
function camelToSnake(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/__/g, "_").toLowerCase();
}
function ixNameOnChain(ix) {
  switch (ix) {
    case "initializeConfig":
      return "initialize_config";
    case "setAuthority":
      return "set_authority";
    case "setSeason":
      return "set_season";
    case "setDecayBps":
      return "set_decay_bps";
    case "setRepMint":
      return "set_rep_mint";
    case "addReputation":
      return "add_reputation";
    case "resetReputation":
      return "reset_reputation";
    case "transferReputation":
      return "transfer_reputation";
    case "upsertProjectMetadata":
      return "upsert_project_metadata";
    case "closeReputation":
      return "close_reputation";
    case "closeProjectMetadata":
      return "close_project_metadata";
    case "closeConfig":
      return "close_config";
    case "adminCloseAny":
      return "admin_close_any";
    default:
      return camelToSnake(ix);
  }
}
function anchorDiscSync(preimage) {
  const cached = discCache.get(preimage);
  if (cached) return cached;
  const h = sha2562(utf8ToBytes(preimage));
  const disc = h.slice(0, 8);
  discCache.set(preimage, disc);
  return disc;
}
async function ixDiscriminator(idlIxName) {
  const onChain = ixNameOnChain(idlIxName);
  return anchorDiscSync(`global:${onChain}`);
}
async function accountDiscriminator(accountName) {
  return anchorDiscSync(`account:${accountName}`);
}
function discHex(d) {
  return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function decodeReputationConfig(dataIn) {
  const data = toU8(dataIn);
  const disc = await accountDiscriminator("ReputationConfig");
  if (data.length < 8) throw new Error("Config data too small");
  if (!u8eq(data.subarray(0, 8), disc)) {
    throw new Error("Not a ReputationConfig account (bad discriminator)");
  }
  if (data.length < 113) throw new RangeError("Config data out of bounds");
  let o = 8;
  const version = data[o];
  o += 1;
  const daoId = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const authority = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const repMint = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const currentSeason = readU16LE(data, o);
  o += 2;
  const decayBps = readU16LE(data, o);
  o += 2;
  const bump = data[o];
  o += 1;
  return { version, daoId, authority, repMint, currentSeason, decayBps, bump };
}
async function decodeReputation(dataIn) {
  const data = toU8(dataIn);
  const disc = await accountDiscriminator("Reputation");
  if (data.length < 8) throw new Error("Reputation data too small");
  if (!u8eq(data.subarray(0, 8), disc)) {
    throw new Error("Not a Reputation account (bad discriminator)");
  }
  if (data.length < 64) throw new RangeError("Reputation data out of bounds");
  let o = 8;
  const version = data[o];
  o += 1;
  const user = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const season = readU16LE(data, o);
  o += 2;
  const points = readU64LE(data, o);
  o += 8;
  const lastUpdateSlot = readU64LE(data, o);
  o += 8;
  const bump = data[o];
  o += 1;
  return { version, user, season, points, lastUpdateSlot, bump };
}
async function decodeProjectMetadata(dataIn) {
  const data = toU8(dataIn);
  const disc = await accountDiscriminator("ProjectMetadata");
  if (data.length < 8) throw new Error("Metadata data too small");
  if (!u8eq(data.subarray(0, 8), disc)) {
    throw new Error("Not a ProjectMetadata account (bad discriminator)");
  }
  if (data.length < 46) throw new RangeError("Metadata data out of bounds");
  let o = 8;
  const version = data[o];
  o += 1;
  const daoId = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const strLen = readU32LE(data, o);
  o += 4;
  if (o + strLen + 1 > data.length) {
    throw new Error("ProjectMetadata string length out of bounds");
  }
  const strBytes = data.subarray(o, o + strLen);
  o += strLen;
  const metadataUri = new TextDecoder().decode(strBytes);
  const bump = data[o];
  o += 1;
  return { version, daoId, metadataUri, bump };
}
async function fetchConfig(conn, daoId) {
  const [configPda] = getConfigPda(daoId);
  const ai = await conn.getAccountInfo(configPda);
  if (!ai?.data) return null;
  return decodeReputationConfig(ai.data);
}
async function fetchProjectMetadata(conn, daoId) {
  const [metaPda] = getProjectMetaPda(daoId);
  const ai = await conn.getAccountInfo(metaPda);
  if (!ai?.data) return null;
  return decodeProjectMetadata(ai.data);
}
async function fetchReputation(conn, daoId, user, season) {
  const [configPda] = getConfigPda(daoId);
  const [repPda] = getReputationPda(configPda, user, season);
  const ai = await conn.getAccountInfo(repPda);
  if (!ai?.data) return null;
  return decodeReputation(ai.data);
}
async function fetchAllSpaces(conn, programId = VINE_REP_PROGRAM_ID) {
  const accts = await conn.getProgramAccounts(programId);
  const disc = await accountDiscriminator("ReputationConfig");
  const out = [];
  for (const a of accts) {
    try {
      if (!a.account.owner.equals(programId)) continue;
      const raw = a.account.data;
      if (!raw || raw.length < 8) continue;
      if (!u8eq(raw.subarray(0, 8), disc)) continue;
      const cfg = await decodeReputationConfig(raw);
      const [expected] = getConfigPda(cfg.daoId, programId);
      if (!expected.equals(a.pubkey)) continue;
      out.push({
        version: cfg.version,
        daoId: cfg.daoId,
        authority: cfg.authority,
        repMint: cfg.repMint,
        currentSeason: cfg.currentSeason,
        decayBps: cfg.decayBps,
        configPda: a.pubkey
      });
    } catch {
    }
  }
  const byDao = /* @__PURE__ */ new Map();
  for (const s of out) {
    const k = s.daoId.toBase58();
    const prev = byDao.get(k);
    if (!prev || s.currentSeason > prev.currentSeason) byDao.set(k, s);
  }
  return Array.from(byDao.values());
}
async function buildInitializeConfigIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("initializeConfig");
  const data = new Uint8Array(8 + 32 + 32 + 2);
  let o = 0;
  data.set(disc, o);
  o += 8;
  data.set(args.daoId.toBytes(), o);
  o += 32;
  data.set(args.repMint.toBytes(), o);
  o += 32;
  data.set(u16le(args.initialSeason & 65535), o);
  o += 2;
  const [configPda] = getConfigPda(args.daoId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: false, isWritable: false },
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.from(data)
  });
}
async function buildUpsertProjectMetadataIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("upsertProjectMetadata");
  const { len, bytes } = encodeAnchorString(args.metadataUri || "");
  const data = new Uint8Array(8 + 4 + bytes.length);
  data.set(disc, 0);
  data.set(len, 8);
  data.set(bytes, 12);
  const [configPda] = getConfigPda(args.daoId, programId);
  const [metaPda] = getProjectMetaPda(args.daoId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: metaPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false },
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.from(data)
  });
}
async function buildSetAuthorityIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("setAuthority");
  const data = new Uint8Array(8 + 32);
  data.set(disc, 0);
  data.set(args.newAuthority.toBytes(), 8);
  const [configPda] = getConfigPda(args.daoId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false }
    ],
    data: Buffer.from(data)
  });
}
async function buildSetSeasonIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("setSeason");
  const data = new Uint8Array(8 + 2);
  data.set(disc, 0);
  data.set(u16le(args.newSeason & 65535), 8);
  const [configPda] = getConfigPda(args.daoId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false }
    ],
    data: Buffer.from(data)
  });
}
async function buildSetDecayBpsIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("setDecayBps");
  const decay = Number(args.decayBps);
  if (!Number.isFinite(decay) || decay < 0 || decay > 1e4) {
    throw new Error("decayBps must be 0..=10000");
  }
  const data = new Uint8Array(8 + 2);
  data.set(disc, 0);
  data.set(u16le(decay & 65535), 8);
  const [configPda] = getConfigPda(args.daoId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false }
    ],
    data: Buffer.from(data)
  });
}
async function buildSetRepMintIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("setRepMint");
  const data = new Uint8Array(8 + 32);
  data.set(disc, 0);
  data.set(args.newRepMint.toBytes(), 8);
  const [configPda] = getConfigPda(args.daoId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false }
    ],
    data: Buffer.from(data)
  });
}
function isRepNewLayout(data) {
  return data.length >= 92;
}
function decodeReputationNewLayout(dataIn) {
  const data = toU8(dataIn);
  let o = 8;
  const version = data[o];
  o += 1;
  o += 32;
  const user = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const season = readU16LE(data, o);
  o += 2;
  const points = readU64LE(data, o);
  o += 8;
  const lastUpdateSlot = readU64LE(data, o);
  o += 8;
  return { version, user, season, points, lastUpdateSlot };
}
async function fetchReputationsForDaoSeason(args) {
  const {
    conn,
    daoId,
    season,
    programId = VINE_REP_PROGRAM_ID,
    limit = 5e4,
    commitment = "confirmed"
  } = args;
  const [configPda] = getConfigPda(daoId, programId);
  const disc = await accountDiscriminator("Reputation");
  const disc58 = bs58.encode(disc);
  const seasonBytes = u16le(season & 65535);
  const season58 = bs58.encode(seasonBytes);
  const newLayoutCfg = {
    commitment,
    encoding: "base64",
    dataSlice: { offset: 0, length: 92 },
    filters: [
      { memcmp: { offset: 0, bytes: disc58 } },
      // discriminator
      { memcmp: { offset: 9, bytes: configPda.toBase58() } },
      // ✅ likely correct
      { memcmp: { offset: 73, bytes: season58 } }
      // season (new layout only)
    ]
  };
  const oldLayoutCfg = {
    commitment,
    encoding: "base64",
    dataSlice: { offset: 0, length: 80 },
    filters: [
      { memcmp: { offset: 0, bytes: disc58 } },
      // discriminator
      { memcmp: { offset: 41, bytes: season58 } }
      // season (old layout)
    ]
  };
  const [newHits, oldHits] = await Promise.allSettled([
    conn.getProgramAccounts(programId, newLayoutCfg),
    conn.getProgramAccounts(programId, oldLayoutCfg)
  ]);
  const merged = [
    ...newHits.status === "fulfilled" ? newHits.value : [],
    ...oldHits.status === "fulfilled" ? oldHits.value : []
  ];
  const byPk = /* @__PURE__ */ new Map();
  for (const a of merged) byPk.set(a.pubkey.toBase58(), a);
  const out = [];
  for (const a of byPk.values()) {
    try {
      const raw = a.account.data;
      if (!raw || raw.length < 8) continue;
      if (!u8eq(raw.subarray(0, 8), disc)) continue;
      const decoded = isRepNewLayout(raw) ? decodeReputationNewLayout(raw) : await decodeReputation(raw);
      const [expected] = getReputationPda(configPda, decoded.user, season, programId);
      if (!expected.equals(a.pubkey)) continue;
      out.push({
        pubkey: a.pubkey,
        user: decoded.user,
        season: decoded.season,
        points: decoded.points,
        lastUpdateSlot: decoded.lastUpdateSlot
      });
    } catch {
    }
  }
  out.sort((a, b) => a.points === b.points ? 0 : a.points > b.points ? -1 : 1);
  return out.slice(0, limit);
}
async function buildAddReputationPointsIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("addReputation");
  const data = new Uint8Array(8 + 8);
  data.set(disc, 0);
  data.set(u64le(args.amount), 8);
  const [configPda] = getConfigPda(args.daoId, programId);
  const ai = await args.conn.getAccountInfo(configPda);
  if (!ai?.data) throw new Error("Config PDA not found for this DAO.");
  const cfg = await decodeReputationConfig(ai.data);
  const cfgSeason = Number(cfg.currentSeason);
  const season = args.season == null ? cfgSeason : Number(args.season);
  if (season !== cfgSeason) {
    throw new Error(
      `SeasonMismatch (client): provided season=${season} but config.currentSeason=${cfgSeason}`
    );
  }
  const [repPda] = getReputationPda(configPda, args.user, season, programId);
  return {
    season,
    configPda,
    repPda,
    ix: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: args.authority, isSigner: true, isWritable: false },
        { pubkey: args.user, isSigner: false, isWritable: false },
        { pubkey: repPda, isSigner: false, isWritable: true },
        { pubkey: args.payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      data: Buffer.from(data)
    })
  };
}
async function buildAddReputationIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("addReputation");
  const data = new Uint8Array(8 + 8);
  data.set(disc, 0);
  data.set(u64le(args.amount), 8);
  const [configPda] = getConfigPda(args.daoId, programId);
  const ai = await args.conn.getAccountInfo(configPda);
  if (!ai?.data) throw new Error("Config PDA not found for this DAO.");
  const cfg = await decodeReputationConfig(ai.data);
  const cfgSeason = Number(cfg.currentSeason);
  if (!Number.isFinite(cfgSeason) || cfgSeason < 0 || cfgSeason > 65535) {
    throw new Error(`Invalid config.currentSeason: ${cfgSeason}`);
  }
  const season = args.season == null ? cfgSeason : Number(args.season);
  if (season !== cfgSeason) {
    throw new Error(
      `SeasonMismatch (client): provided season=${season} but config.currentSeason=${cfgSeason}`
    );
  }
  const [repPda] = getReputationPda(configPda, args.user, season, programId);
  const repAi = await args.conn.getAccountInfo(repPda);
  let current = 0n;
  if (repAi?.data?.length) {
    const rep = await decodeReputation(repAi.data);
    current = rep.points ?? 0n;
  }
  const nextTotal = current + args.amount;
  data.set(u64le(nextTotal), 8);
  return {
    season,
    configPda,
    repPda,
    ix: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: args.authority, isSigner: true, isWritable: false },
        { pubkey: args.user, isSigner: false, isWritable: false },
        { pubkey: repPda, isSigner: false, isWritable: true },
        { pubkey: args.payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      data: Buffer.from(data)
    })
  };
}
async function buildResetReputationIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("addReputation");
  const data = new Uint8Array(8 + 8);
  data.set(disc, 0);
  data.set(u64le(0n), 8);
  const [configPda] = getConfigPda(args.daoId, programId);
  const ai = await args.conn.getAccountInfo(configPda);
  if (!ai?.data) throw new Error("Config PDA not found for this DAO.");
  const cfg = await decodeReputationConfig(ai.data);
  const cfgSeason = Number(cfg.currentSeason);
  if (!Number.isFinite(cfgSeason) || cfgSeason < 0 || cfgSeason > 65535) {
    throw new Error(`Invalid config.currentSeason: ${cfgSeason}`);
  }
  const season = args.season == null ? cfgSeason : Number(args.season);
  if (season !== cfgSeason) {
    throw new Error(
      `SeasonMismatch (client): provided season=${season} but config.currentSeason=${cfgSeason}`
    );
  }
  const [repPda] = getReputationPda(configPda, args.user, season, programId);
  const nextTotal = 0n;
  data.set(u64le(nextTotal), 8);
  return {
    season,
    configPda,
    repPda,
    ix: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: args.authority, isSigner: true, isWritable: false },
        { pubkey: args.user, isSigner: false, isWritable: false },
        { pubkey: repPda, isSigner: false, isWritable: true },
        { pubkey: args.authority, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      data: Buffer.from(data)
    })
  };
}
async function buildCloseReputationIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("closeReputation");
  const data = new Uint8Array(8 + 2);
  data.set(disc, 0);
  data.set(u16le(args.season & 65535), 8);
  const [configPda] = getConfigPda(args.daoId, programId);
  const [reputationPda] = getReputationPda(
    configPda,
    args.user,
    args.season,
    programId
  );
  return {
    configPda,
    reputationPda,
    ix: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: args.authority, isSigner: true, isWritable: false },
        { pubkey: args.user, isSigner: false, isWritable: false },
        { pubkey: reputationPda, isSigner: false, isWritable: true },
        { pubkey: args.recipient, isSigner: false, isWritable: true }
      ],
      data: Buffer.from(data)
    })
  };
}
async function buildAdminCloseAnyIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("adminCloseAny");
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: args.authority, isSigner: true, isWritable: false },
      { pubkey: args.target, isSigner: false, isWritable: true },
      { pubkey: args.recipient, isSigner: false, isWritable: true }
    ],
    data: Buffer.from(disc)
    // only discriminator, no args
  });
}
async function buildTransferReputationIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("transferReputation");
  const data = new Uint8Array(8);
  data.set(disc, 0);
  const [configPda] = getConfigPda(args.daoId, programId);
  const [repFrom] = getReputationPda(configPda, args.oldWallet, args.season, programId);
  const [repTo] = getReputationPda(configPda, args.newWallet, args.season, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: args.authority, isSigner: true, isWritable: false },
      { pubkey: args.oldWallet, isSigner: false, isWritable: false },
      { pubkey: args.newWallet, isSigner: false, isWritable: false },
      { pubkey: repFrom, isSigner: false, isWritable: true },
      { pubkey: repTo, isSigner: false, isWritable: true },
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.from(data)
  });
}
async function buildCloseConfigIx(args) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("closeConfig");
  const data = new Uint8Array(8);
  data.set(disc, 0);
  const [configPda] = getConfigPda(args.daoId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false },
      { pubkey: args.recipient, isSigner: false, isWritable: true }
    ],
    data: Buffer.from(data)
  });
}
export {
  VINE_REP_PROGRAM_ID,
  accountDiscriminator,
  buildAddReputationIx,
  buildAddReputationPointsIx,
  buildAdminCloseAnyIx,
  buildCloseConfigIx,
  buildCloseReputationIx,
  buildInitializeConfigIx,
  buildResetReputationIx,
  buildSetAuthorityIx,
  buildSetDecayBpsIx,
  buildSetRepMintIx,
  buildSetSeasonIx,
  buildTransferReputationIx,
  buildUpsertProjectMetadataIx,
  decodeProjectMetadata,
  decodeReputation,
  decodeReputationConfig,
  discHex,
  fetchAllSpaces,
  fetchConfig,
  fetchProjectMetadata,
  fetchReputation,
  fetchReputationsForDaoSeason,
  getConfigPda,
  getProjectMetaPda,
  getReputationPda,
  ixDiscriminator
};
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
