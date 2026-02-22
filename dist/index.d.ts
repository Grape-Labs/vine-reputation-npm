import { Buffer } from 'buffer';
import { PublicKey, Connection, TransactionInstruction, Commitment } from '@solana/web3.js';

/**
 * Program ID
 */
declare const VINE_REP_PROGRAM_ID: PublicKey;
/**
 * -----------------------------
 * PDA helpers
 * -----------------------------
 */
declare function getConfigPda(daoId: PublicKey, programId?: PublicKey): [PublicKey, number];
declare function getProjectMetaPda(daoId: PublicKey, programId?: PublicKey): [PublicKey, number];
/**
 * reputation PDA:
 * ["reputation", configPda, user, season(u16le)]
 */
declare function getReputationPda(configPda: PublicKey, user: PublicKey, season: number, programId?: PublicKey): [PublicKey, number];
/**
 * delegate PDA:
 * ["delegate", configPda, delegateWallet]
 */
declare function getDelegatePda(configPda: PublicKey, delegateWallet: PublicKey, programId?: PublicKey): [PublicKey, number];
declare function ixDiscriminator(idlIxName: string): Promise<Uint8Array>;
declare function accountDiscriminator(accountName: string): Promise<Uint8Array>;
declare function discHex(d: Uint8Array): string;
/**
 * -----------------------------
 * Account types (match IDL structs)
 * -----------------------------
 */
type ReputationConfigAccount = {
    version: number;
    daoId: PublicKey;
    authority: PublicKey;
    repMint: PublicKey;
    currentSeason: number;
    decayBps: number;
    bump: number;
};
type ReputationAccount = {
    version: number;
    user: PublicKey;
    season: number;
    points: bigint;
    lastUpdateSlot: bigint;
    bump: number;
};
type ProjectMetadataAccount = {
    version: number;
    daoId: PublicKey;
    metadataUri: string;
    bump: number;
};
type DelegateAccount = {
    version: number;
    config: PublicKey;
    delegate: PublicKey;
    canAward: boolean;
    canReset: boolean;
    bump: number;
};
/**
 * -----------------------------
 * Decoders
 * -----------------------------
 */
declare function decodeReputationConfig(dataIn: Uint8Array | Buffer): Promise<ReputationConfigAccount>;
declare function decodeReputation(dataIn: Uint8Array | Buffer): Promise<ReputationAccount>;
declare function decodeProjectMetadata(dataIn: Uint8Array | Buffer): Promise<ProjectMetadataAccount>;
declare function decodeDelegate(dataIn: Uint8Array | Buffer): Promise<DelegateAccount>;
/**
 * -----------------------------
 * Fetch helpers
 * -----------------------------
 */
declare function fetchConfig(conn: Connection, daoId: PublicKey): Promise<ReputationConfigAccount | null>;
declare function fetchProjectMetadata(conn: Connection, daoId: PublicKey): Promise<ProjectMetadataAccount | null>;
declare function fetchReputation(conn: Connection, daoId: PublicKey, user: PublicKey, season: number): Promise<ReputationAccount | null>;
declare function fetchDelegate(conn: Connection, configPda: PublicKey, delegateWallet: PublicKey): Promise<DelegateAccount | null>;
/**
 * -----------------------------
 * Space discovery (SAFE + composable)
 * - Finds ReputationConfig accounts
 * - Verifies PDA matches daoId inside decoded account
 * -----------------------------
 */
type VineSpace = {
    version: number;
    daoId: PublicKey;
    authority: PublicKey;
    repMint: PublicKey;
    currentSeason: number;
    decayBps: number;
    configPda: PublicKey;
};
declare function fetchAllSpaces(conn: Connection, programId?: PublicKey): Promise<VineSpace[]>;
declare function fetchAllSpacesGPA(conn: Connection, programId?: PublicKey): Promise<VineSpace[]>;
/**
 * -----------------------------
 * Instruction builders
 * -----------------------------
 */
declare function buildInitializeConfigIx(args: {
    daoId: PublicKey;
    repMint: PublicKey;
    initialSeason: number;
    authority: PublicKey;
    payer: PublicKey;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
declare function buildUpsertProjectMetadataIx(args: {
    daoId: PublicKey;
    authority: PublicKey;
    payer: PublicKey;
    metadataUri: string;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
declare function buildSetAuthorityIx(args: {
    daoId: PublicKey;
    authority: PublicKey;
    newAuthority: PublicKey;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
declare function buildSetSeasonIx(args: {
    daoId: PublicKey;
    authority: PublicKey;
    newSeason: number;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
declare function buildSetDecayBpsIx(args: {
    daoId: PublicKey;
    authority: PublicKey;
    decayBps: number;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
declare function buildSetRepMintIx(args: {
    daoId: PublicKey;
    authority: PublicKey;
    newRepMint: PublicKey;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
/**
 * -----------------------------
 * Delegate instruction builders
 * -----------------------------
 */
declare function buildAddDelegateIx(args: {
    daoId: PublicKey;
    authority: PublicKey;
    delegateWallet: PublicKey;
    canAward: boolean;
    canReset: boolean;
    payer: PublicKey;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
declare function buildUpdateDelegateIx(args: {
    daoId: PublicKey;
    authority: PublicKey;
    delegateWallet: PublicKey;
    canAward: boolean;
    canReset: boolean;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
declare function buildRemoveDelegateIx(args: {
    daoId: PublicKey;
    authority: PublicKey;
    delegateWallet: PublicKey;
    recipient: PublicKey;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
/**
 * -----------------------------
 * Reputation instruction builders
 * -----------------------------
 */
type RepRow = {
    pubkey: PublicKey;
    user: PublicKey;
    season: number;
    points: bigint;
    lastUpdateSlot: bigint;
};
declare function fetchReputationsForDaoSeason(args: {
    conn: Connection;
    daoId: PublicKey;
    season: number;
    programId?: PublicKey;
    limit?: number;
    commitment?: Commitment;
}): Promise<RepRow[]>;
declare function buildAddReputationPointsIx(args: {
    conn: Connection;
    daoId: PublicKey;
    authority: PublicKey;
    payer: PublicKey;
    user: PublicKey;
    amount: bigint;
    season?: number;
    programId?: PublicKey;
}): Promise<{
    season: number;
    configPda: PublicKey;
    repPda: PublicKey;
    ix: TransactionInstruction;
}>;
declare function buildAddReputationIx(args: {
    conn: Connection;
    daoId: PublicKey;
    authority: PublicKey;
    payer: PublicKey;
    user: PublicKey;
    amount: bigint;
    season?: number;
    programId?: PublicKey;
}): Promise<{
    season: number;
    configPda: PublicKey;
    repPda: PublicKey;
    ix: TransactionInstruction;
}>;
declare function buildResetReputationIx(args: {
    conn: Connection;
    daoId: PublicKey;
    authority: PublicKey;
    user: PublicKey;
    season?: number;
    programId?: PublicKey;
}): Promise<{
    season: number;
    configPda: PublicKey;
    repPda: PublicKey;
    ix: TransactionInstruction;
}>;
declare function buildCloseReputationIx(args: {
    daoId: PublicKey;
    user: PublicKey;
    season: number;
    authority: PublicKey;
    recipient: PublicKey;
    programId?: PublicKey;
}): Promise<{
    configPda: PublicKey;
    reputationPda: PublicKey;
    ix: TransactionInstruction;
}>;
declare function buildAdminCloseAnyIx(args: {
    target: PublicKey;
    authority: PublicKey;
    recipient: PublicKey;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
declare function buildTransferReputationIx(args: {
    conn: Connection;
    daoId: PublicKey;
    authority: PublicKey;
    payer: PublicKey;
    oldWallet: PublicKey;
    newWallet: PublicKey;
    season?: number;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;
declare function buildCloseConfigIx(args: {
    daoId: PublicKey;
    authority: PublicKey;
    recipient: PublicKey;
    programId?: PublicKey;
}): Promise<TransactionInstruction>;

export { type DelegateAccount, type ProjectMetadataAccount, type RepRow, type ReputationAccount, type ReputationConfigAccount, VINE_REP_PROGRAM_ID, type VineSpace, accountDiscriminator, buildAddDelegateIx, buildAddReputationIx, buildAddReputationPointsIx, buildAdminCloseAnyIx, buildCloseConfigIx, buildCloseReputationIx, buildInitializeConfigIx, buildRemoveDelegateIx, buildResetReputationIx, buildSetAuthorityIx, buildSetDecayBpsIx, buildSetRepMintIx, buildSetSeasonIx, buildTransferReputationIx, buildUpdateDelegateIx, buildUpsertProjectMetadataIx, decodeDelegate, decodeProjectMetadata, decodeReputation, decodeReputationConfig, discHex, fetchAllSpaces, fetchAllSpacesGPA, fetchConfig, fetchDelegate, fetchProjectMetadata, fetchReputation, fetchReputationsForDaoSeason, getConfigPda, getDelegatePda, getProjectMetaPda, getReputationPda, ixDiscriminator };
