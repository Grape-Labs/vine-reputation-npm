/* vine-reputation-client.ts */
import bs58 from "bs58";
import { Buffer } from "buffer";
import {
  Commitment,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  GetProgramAccountsConfig,
} from "@solana/web3.js";

// ✅ Deterministic sha256 (no WebCrypto subtleties)
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";

/**
 * Program ID
 */
export const VINE_REP_PROGRAM_ID = new PublicKey(
  "V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX"
);

/**
 * -----------------------------
 * Small helpers (browser-safe)
 * -----------------------------
 */
function utf8(s: string) {
  return new TextEncoder().encode(s);
}

function toU8(data: Uint8Array | Buffer): Uint8Array {
  return data instanceof Buffer ? new Uint8Array(data) : data;
}

function u8eq(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function u16le(n: number) {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32le(n: number) {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function u64le(n: bigint) {
  const b = new Uint8Array(8);
  let x = BigInt(n);
  for (let i = 0; i < 8; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

function encodeAnchorString(s: string) {
  const bytes = utf8(s ?? "");
  return { len: u32le(bytes.length), bytes };
}

function readU16LE(buf: Uint8Array, offset: number): number {
  if (offset + 2 > buf.length) throw new RangeError("u16 out of bounds");
  return buf[offset] | (buf[offset + 1] << 8);
}

function readU32LE(buf: Uint8Array, offset: number): number {
  if (offset + 4 > buf.length) throw new RangeError("u32 out of bounds");
  return (
    buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)
  ) >>> 0;
}

function readU64LE(buf: Uint8Array, offset: number): bigint {
  if (offset + 8 > buf.length) throw new RangeError("u64 out of bounds");
  let x = 0n;
  for (let i = 7; i >= 0; i--) x = (x << 8n) + BigInt(buf[offset + i]);
  return x;
}

/**
 * -----------------------------
 * PDA helpers
 * -----------------------------
 */

export function getConfigPda(daoId: PublicKey, programId = VINE_REP_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([utf8("config"), daoId.toBytes()], programId);
}

export function getProjectMetaPda(
  daoId: PublicKey,
  programId = VINE_REP_PROGRAM_ID
) {
  return PublicKey.findProgramAddressSync(
    [utf8("project_meta"), daoId.toBytes()],
    programId
  );
}

/**
 * reputation PDA:
 * ["reputation", configPda, user, season(u16le)]
 */
export function getReputationPda(
  configPda: PublicKey,
  user: PublicKey,
  season: number,
  programId = VINE_REP_PROGRAM_ID
) {
  const seasonSeed = u16le(season & 0xffff);
  return PublicKey.findProgramAddressSync(
    [utf8("reputation"), configPda.toBytes(), user.toBytes(), seasonSeed],
    programId
  );
}

/**
 * -----------------------------
 * Anchor discriminators (FIXED)
 * Anchor on-chain discriminators are derived from:
 *   ix  => sha256("global:<rust_snake_case_name>")[0..8]
 *   acct=> sha256("account:<Name>")[0..8]
 *
 * Your JS/IDL uses camelCase, but Rust is snake_case.
 * So we MUST convert before hashing.
 * -----------------------------
 */

const discCache = new Map<string, Uint8Array>();

function camelToSnake(s: string): string {
  // initializeConfig -> initialize_config
  // setDecayBps -> set_decay_bps
  // adminCloseAny -> admin_close_any
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/__/g, "_")
    .toLowerCase();
}

// (Optional) explicit overrides if you ever need them
function ixNameOnChain(ix: string): string {
  // if you want hard guarantees, keep these:
  switch (ix) {
    case "initializeConfig": return "initialize_config";
    case "setAuthority": return "set_authority";
    case "setSeason": return "set_season";
    case "setDecayBps": return "set_decay_bps";
    case "setRepMint": return "set_rep_mint";
    case "addReputation": return "add_reputation";
    case "resetReputation": return "reset_reputation";
    case "transferReputation": return "transfer_reputation";
    case "upsertProjectMetadata": return "upsert_project_metadata";
    case "closeReputation": return "close_reputation";
    case "closeProjectMetadata": return "close_project_metadata";
    case "closeConfig": return "close_config";
    case "adminCloseAny": return "admin_close_any";
    default:
      // fallback: generic camel->snake (safe for new ixs)
      return camelToSnake(ix);
  }
}

function anchorDiscSync(preimage: string): Uint8Array {
  const cached = discCache.get(preimage);
  if (cached) return cached;

  const h = sha256(utf8ToBytes(preimage));
  const disc = h.slice(0, 8);
  discCache.set(preimage, disc);
  return disc;
}

// IMPORTANT: callers pass IDL/JS name (camelCase). We convert to on-chain snake_case.
export async function ixDiscriminator(idlIxName: string): Promise<Uint8Array> {
  const onChain = ixNameOnChain(idlIxName);
  return anchorDiscSync(`global:${onChain}`);
}

export async function accountDiscriminator(accountName: string): Promise<Uint8Array> {
  return anchorDiscSync(`account:${accountName}`);
}

// Useful when debugging mismatches:
export function discHex(d: Uint8Array) {
  return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * -----------------------------
 * Account types (match IDL structs)
 * -----------------------------
 */

export type ReputationConfigAccount = {
  version: number; // u8
  daoId: PublicKey;
  authority: PublicKey;
  repMint: PublicKey;
  currentSeason: number; // u16
  decayBps: number; // u16
  bump: number; // u8
};

export type ReputationAccount = {
  version: number; // u8
  user: PublicKey;
  season: number; // u16
  points: bigint; // u64
  lastUpdateSlot: bigint; // u64
  bump: number; // u8
};

export type ProjectMetadataAccount = {
  version: number; // u8
  daoId: PublicKey;
  metadataUri: string;
  bump: number; // u8
};

/**
 * -----------------------------
 * Decoders (your existing ones are fine)
 * -----------------------------
 */

export async function decodeReputationConfig(
  dataIn: Uint8Array | Buffer
): Promise<ReputationConfigAccount> {
  const data = toU8(dataIn);
  const disc = await accountDiscriminator("ReputationConfig");
  if (data.length < 8) throw new Error("Config data too small");
  if (!u8eq(data.subarray(0, 8), disc)) {
    throw new Error("Not a ReputationConfig account (bad discriminator)");
  }

  if (data.length < 113) throw new RangeError("Config data out of bounds");

  let o = 8;
  const version = data[o]; o += 1;

  const daoId = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const authority = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const repMint = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const currentSeason = readU16LE(data, o); o += 2;
  const decayBps = readU16LE(data, o); o += 2;
  const bump = data[o]; o += 1;

  return { version, daoId, authority, repMint, currentSeason, decayBps, bump };
}

export async function decodeReputation(
  dataIn: Uint8Array | Buffer
): Promise<ReputationAccount> {
  const data = toU8(dataIn);
  const disc = await accountDiscriminator("Reputation");
  if (data.length < 8) throw new Error("Reputation data too small");
  if (!u8eq(data.subarray(0, 8), disc)) {
    throw new Error("Not a Reputation account (bad discriminator)");
  }

  if (data.length < 64) throw new RangeError("Reputation data out of bounds");

  let o = 8;
  const version = data[o]; o += 1;

  const user = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const season = readU16LE(data, o); o += 2;
  const points = readU64LE(data, o); o += 8;
  const lastUpdateSlot = readU64LE(data, o); o += 8;
  const bump = data[o]; o += 1;

  return { version, user, season, points, lastUpdateSlot, bump };
}

export async function decodeProjectMetadata(
  dataIn: Uint8Array | Buffer
): Promise<ProjectMetadataAccount> {
  const data = toU8(dataIn);
  const disc = await accountDiscriminator("ProjectMetadata");
  if (data.length < 8) throw new Error("Metadata data too small");
  if (!u8eq(data.subarray(0, 8), disc)) {
    throw new Error("Not a ProjectMetadata account (bad discriminator)");
  }

  if (data.length < 46) throw new RangeError("Metadata data out of bounds");

  let o = 8;
  const version = data[o]; o += 1;

  const daoId = new PublicKey(data.subarray(o, o + 32)); o += 32;

  const strLen = readU32LE(data, o); o += 4;
  if (o + strLen + 1 > data.length) {
    throw new Error("ProjectMetadata string length out of bounds");
  }

  const strBytes = data.subarray(o, o + strLen); o += strLen;
  const metadataUri = new TextDecoder().decode(strBytes);

  const bump = data[o]; o += 1;

  return { version, daoId, metadataUri, bump };
}

/**
 * -----------------------------
 * Fetch helpers
 * -----------------------------
 */

export async function fetchConfig(conn: Connection, daoId: PublicKey) {
  const [configPda] = getConfigPda(daoId);
  const ai = await conn.getAccountInfo(configPda);
  if (!ai?.data) return null;
  return decodeReputationConfig(ai.data as any);
}

export async function fetchProjectMetadata(conn: Connection, daoId: PublicKey) {
  const [metaPda] = getProjectMetaPda(daoId);
  const ai = await conn.getAccountInfo(metaPda);
  if (!ai?.data) return null;
  return decodeProjectMetadata(ai.data as any);
}

export async function fetchReputation(
  conn: Connection,
  daoId: PublicKey,
  user: PublicKey,
  season: number
) {
  const [configPda] = getConfigPda(daoId);
  const [repPda] = getReputationPda(configPda, user, season);
  const ai = await conn.getAccountInfo(repPda);
  if (!ai?.data) return null;
  return decodeReputation(ai.data as any);
}

/**
 * -----------------------------
 * Space discovery (SAFE + composable)
 * - Finds ReputationConfig accounts
 * - Verifies PDA matches daoId inside decoded account
 * -----------------------------
 */

export type VineSpace = {
  version: number;
  daoId: PublicKey;
  authority: PublicKey;
  repMint: PublicKey;
  currentSeason: number;
  decayBps: number;
  configPda: PublicKey;
};

export async function fetchAllSpaces(
  conn: Connection,
  programId: PublicKey = VINE_REP_PROGRAM_ID
): Promise<VineSpace[]> {
  const accts = await conn.getProgramAccounts(programId);

  // discriminator for the config account
  const disc = await accountDiscriminator("ReputationConfig");

  const out: VineSpace[] = [];

  for (const a of accts) {
    try {
      if (!a.account.owner.equals(programId)) continue;

      const raw = a.account.data as unknown as Uint8Array;
      if (!raw || raw.length < 8) continue;

      // quick discriminator check
      if (!u8eq(raw.subarray(0, 8), disc)) continue;

      // decode
      const cfg = await decodeReputationConfig(raw);

      // verify PDA matches contents (prevents false positives)
      const [expected] = getConfigPda(cfg.daoId, programId);
      if (!expected.equals(a.pubkey)) continue;

      out.push({
        version: cfg.version,
        daoId: cfg.daoId,
        authority: cfg.authority,
        repMint: cfg.repMint,
        currentSeason: cfg.currentSeason,
        decayBps: cfg.decayBps,
        configPda: a.pubkey,
      });
    } catch {
      // ignore bad accounts
    }
  }

  // de-dupe by daoId (keep highest season)
  const byDao = new Map<string, VineSpace>();
  for (const s of out) {
    const k = s.daoId.toBase58();
    const prev = byDao.get(k);
    if (!prev || s.currentSeason > prev.currentSeason) byDao.set(k, s);
  }

  return Array.from(byDao.values());
}

/**
 * -----------------------------
 * Instruction builders
 * (NO CHANGE needed besides fixed ixDiscriminator above)
 * -----------------------------
 */

export async function buildInitializeConfigIx(args: {
  daoId: PublicKey;
  repMint: PublicKey;
  initialSeason: number; // u16
  authority: PublicKey;  // NOT signer (per IDL)
  payer: PublicKey;      // signer
  programId?: PublicKey;
}) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("initializeConfig");

  const data = new Uint8Array(8 + 32 + 32 + 2);
  let o = 0;
  data.set(disc, o); o += 8;
  data.set(args.daoId.toBytes(), o); o += 32;
  data.set(args.repMint.toBytes(), o); o += 32;
  data.set(u16le(args.initialSeason & 0xffff), o); o += 2;

  const [configPda] = getConfigPda(args.daoId, programId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: false, isWritable: false },
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildUpsertProjectMetadataIx(args: {
  daoId: PublicKey;
  authority: PublicKey; // signer
  payer: PublicKey;     // signer
  metadataUri: string;
  programId?: PublicKey;
}) {
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
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Keep the rest of your builders exactly as-is.
 * They will start working once ixDiscriminator() hashes the on-chain snake_case name.
 */

export async function buildSetAuthorityIx(args: {
  daoId: PublicKey;
  authority: PublicKey; // signer
  newAuthority: PublicKey;
  programId?: PublicKey;
}) {
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
      { pubkey: args.authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildSetSeasonIx(args: {
  daoId: PublicKey;
  authority: PublicKey; // signer
  newSeason: number; // u16
  programId?: PublicKey;
}) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("setSeason");

  const data = new Uint8Array(8 + 2);
  data.set(disc, 0);
  data.set(u16le(args.newSeason & 0xffff), 8);

  const [configPda] = getConfigPda(args.daoId, programId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildSetDecayBpsIx(args: {
  daoId: PublicKey;
  authority: PublicKey; // signer
  decayBps: number; // u16
  programId?: PublicKey;
}) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("setDecayBps");

  const decay = Number(args.decayBps);
  if (!Number.isFinite(decay) || decay < 0 || decay > 10_000) {
    throw new Error("decayBps must be 0..=10000");
  }

  const data = new Uint8Array(8 + 2);
  data.set(disc, 0);
  data.set(u16le(decay & 0xffff), 8);

  const [configPda] = getConfigPda(args.daoId, programId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildSetRepMintIx(args: {
  daoId: PublicKey;
  authority: PublicKey; // signer
  newRepMint: PublicKey;
  programId?: PublicKey;
}) {
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
      { pubkey: args.authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export type RepRow = {
  pubkey: PublicKey;
  user: PublicKey;
  season: number;
  points: bigint;
  lastUpdateSlot: bigint;
};

function isRepNewLayout(data: Uint8Array) {
  // new layout minimum (disc+version+dao+user+season+points+slot+bump) ~= 92
  return data.length >= 92;
}

function decodeReputationNewLayout(dataIn: Uint8Array | Buffer) {
  const data = toU8(dataIn);
  // disc(8) + version(1) + dao(32) + user(32) + season(2) + points(8) + slot(8) + bump(1)
  let o = 8;
  const version = data[o]; o += 1;

  // dao (skip)
  o += 32;

  const user = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const season = readU16LE(data, o); o += 2;
  const points = readU64LE(data, o); o += 8;
  const lastUpdateSlot = readU64LE(data, o); o += 8;

  return { version, user, season, points, lastUpdateSlot };
}

export async function fetchReputationsForDaoSeason(args: {
  conn: Connection;
  daoId: PublicKey;
  season: number;
  programId?: PublicKey;
  limit?: number;
  commitment?: Commitment;
}): Promise<RepRow[]> {
  const {
    conn,
    daoId,
    season,
    programId = VINE_REP_PROGRAM_ID,
    limit = 50_000,
    commitment = "confirmed",
  } = args;

  const [configPda] = getConfigPda(daoId, programId);

  const disc = await accountDiscriminator("Reputation");
  const disc58 = bs58.encode(disc);
  const seasonBytes = u16le(season & 0xffff);
  const season58 = bs58.encode(seasonBytes);

  // Try both layouts; PDA verification will keep only correct ones.
  const newLayoutCfg: GetProgramAccountsConfig = {
    commitment,
    encoding: "base64",
    dataSlice: { offset: 0, length: 92 },
    filters: [
      { memcmp: { offset: 0, bytes: disc58 } },          // discriminator
      { memcmp: { offset: 9, bytes: configPda.toBase58() } }, // ✅ likely correct
      { memcmp: { offset: 73, bytes: season58 } },       // season (new layout only)
    ],
  };

  const oldLayoutCfg: GetProgramAccountsConfig = {
    commitment,
    encoding: "base64",
    dataSlice: { offset: 0, length: 80 },
    filters: [
      { memcmp: { offset: 0, bytes: disc58 } },     // discriminator
      { memcmp: { offset: 41, bytes: season58 } },  // season (old layout)
    ],
  };

  const [newHits, oldHits] = await Promise.allSettled([
    conn.getProgramAccounts(programId, newLayoutCfg),
    conn.getProgramAccounts(programId, oldLayoutCfg),
  ]);

  const merged = [
    ...(newHits.status === "fulfilled" ? newHits.value : []),
    ...(oldHits.status === "fulfilled" ? oldHits.value : []),
  ];

  // De-dupe by pubkey (same account could appear twice if filters overlap)
  const byPk = new Map<string, (typeof merged)[number]>();
  for (const a of merged) byPk.set(a.pubkey.toBase58(), a);

  const out: RepRow[] = [];

  for (const a of byPk.values()) {
    try {
      const raw = a.account.data as unknown as Uint8Array;
      if (!raw || raw.length < 8) continue;

      // discriminator check (cheap)
      if (!u8eq(raw.subarray(0, 8), disc)) continue;

      // decode either layout
      const decoded = isRepNewLayout(raw)
        ? decodeReputationNewLayout(raw)
        : await decodeReputation(raw); // your existing old-layout decoder

      // HARD FILTER: PDA must match this DAO’s configPda + season + user
      const [expected] = getReputationPda(configPda, decoded.user, season, programId);
      if (!expected.equals(a.pubkey)) continue;

      out.push({
        pubkey: a.pubkey,
        user: decoded.user,
        season: decoded.season,
        points: decoded.points,
        lastUpdateSlot: decoded.lastUpdateSlot,
      });
    } catch {
      // ignore
    }
  }

  // optional: sort by points desc
  out.sort((a, b) => (a.points === b.points ? 0 : a.points > b.points ? -1 : 1));

  return out.slice(0, limit);
}

export async function buildAddReputationPointsIx(args: {
  conn: Connection;
  daoId: PublicKey;
  authority: PublicKey;
  payer: PublicKey;
  user: PublicKey;
  amount: bigint;
  season?: number;
  programId?: PublicKey;
}) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;

  const disc = await ixDiscriminator("addReputation");

  const data = new Uint8Array(8 + 8);
  data.set(disc, 0);
  data.set(u64le(args.amount), 8);

  const [configPda] = getConfigPda(args.daoId, programId);

  const ai = await args.conn.getAccountInfo(configPda);
  if (!ai?.data) throw new Error("Config PDA not found for this DAO.");

  const cfg = await decodeReputationConfig(ai.data as any);
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
        { pubkey: configPda,               isSigner: false, isWritable: false },
        { pubkey: args.authority,          isSigner: true,  isWritable: false },
        { pubkey: args.user,               isSigner: false, isWritable: false },
        { pubkey: repPda,                  isSigner: false, isWritable: true  },
        { pubkey: args.payer,              isSigner: true,  isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    }),
  };
}

export async function buildAddReputationIx(args: {
  conn: Connection;
  daoId: PublicKey;
  authority: PublicKey; // signer
  payer: PublicKey;     // signer
  user: PublicKey;
  amount: bigint;       // u64
  season?: number;      // optional: must match cfg.currentSeason if provided
  programId?: PublicKey;
}) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;

  const disc = await ixDiscriminator("addReputation");

  const data = new Uint8Array(8 + 8);
  data.set(disc, 0);
  data.set(u64le(args.amount), 8);

  const [configPda] = getConfigPda(args.daoId, programId);

  const ai = await args.conn.getAccountInfo(configPda);
  if (!ai?.data) throw new Error("Config PDA not found for this DAO.");

  const cfg = await decodeReputationConfig(ai.data as any);
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
  // fetch existing rep (may not exist yet)
  const repAi = await args.conn.getAccountInfo(repPda);
  let current: bigint = 0n;

  if (repAi?.data?.length) {
    const rep = await decodeReputation(repAi.data as any); // ✅ exists
    current = rep.points ?? 0n;                            // ✅ correct field
  }

  const nextTotal = current + args.amount;

  // serialize nextTotal instead of args.amount
  data.set(u64le(nextTotal), 8);

  return {
    season,
    configPda,
    repPda,
    ix: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: configPda,               isSigner: false, isWritable: false },
        { pubkey: args.authority,          isSigner: true,  isWritable: false },
        { pubkey: args.user,               isSigner: false, isWritable: false },
        { pubkey: repPda,                  isSigner: false, isWritable: true  },
        { pubkey: args.payer,              isSigner: true,  isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    }),
  };
}

export async function buildResetReputationIx(args: {
  conn: Connection;          // ✅ needed to read config.currentSeason
  daoId: PublicKey;
  authority: PublicKey;      // signer
  user: PublicKey;
  season?: number;           // optional; must match cfg.currentSeason if provided
  programId?: PublicKey;
}) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;

  const disc = await ixDiscriminator("addReputation");

  const data = new Uint8Array(8 + 8);
  data.set(disc, 0);
  data.set(u64le(0n), 8);

  const [configPda] = getConfigPda(args.daoId, programId);

  const ai = await args.conn.getAccountInfo(configPda);
  if (!ai?.data) throw new Error("Config PDA not found for this DAO.");

  const cfg = await decodeReputationConfig(ai.data as any);
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

  const nextTotal = 0n

  // serialize nextTotal instead of args.amount
  data.set(u64le(nextTotal), 8);

  return {
    season,
    configPda,
    repPda,
    ix: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: configPda,               isSigner: false, isWritable: false },
        { pubkey: args.authority,          isSigner: true,  isWritable: false },
        { pubkey: args.user,               isSigner: false, isWritable: false },
        { pubkey: repPda,                  isSigner: false, isWritable: true  },
        { pubkey: args.authority,              isSigner: true,  isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    }),
  };
}

export async function buildCloseReputationIx(args: {
  daoId: PublicKey;
  user: PublicKey;
  season: number;            // u16 (explicit, NOT inferred)
  authority: PublicKey;      // signer (must equal config.authority)
  recipient: PublicKey;      // lamports destination
  programId?: PublicKey;
}) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;

  // discriminator: close_reputation
  const disc = await ixDiscriminator("closeReputation");

  // instruction data = discriminator + season(u16)
  const data = new Uint8Array(8 + 2);
  data.set(disc, 0);
  data.set(u16le(args.season & 0xffff), 8);

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
        { pubkey: configPda,        isSigner: false, isWritable: false },
        { pubkey: args.authority,   isSigner: true,  isWritable: false },
        { pubkey: args.user,        isSigner: false, isWritable: false },
        { pubkey: reputationPda,    isSigner: false, isWritable: true  },
        { pubkey: args.recipient,   isSigner: false, isWritable: true  },
      ],
      data: Buffer.from(data),
    }),
  };
}

export async function buildAdminCloseAnyIx(args: {
  target: PublicKey;          // program-owned account to close
  authority: PublicKey;       // signer (must equal ADMIN on-chain)
  recipient: PublicKey;       // lamports destination
  programId?: PublicKey;
}) {
  const programId = args.programId ?? VINE_REP_PROGRAM_ID;
  const disc = await ixDiscriminator("adminCloseAny");

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: args.authority, isSigner: true,  isWritable: false },
      { pubkey: args.target,    isSigner: false, isWritable: true  },
      { pubkey: args.recipient, isSigner: false, isWritable: true  },
    ],
    data: Buffer.from(disc), // only discriminator, no args
  });
}

export async function buildTransferReputationIx(args: {
  daoId: PublicKey;
  authority: PublicKey; // signer
  payer: PublicKey; // signer
  oldWallet: PublicKey;
  newWallet: PublicKey;
  season: number;
  programId?: PublicKey;
}) {
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
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildCloseConfigIx(args: {
  daoId: PublicKey;
  authority: PublicKey; // signer
  recipient: PublicKey;
  programId?: PublicKey;
}) {
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
      { pubkey: args.recipient, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(data),
  });
}