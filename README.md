# OG Reputation Spaces Client

TypeScript client library for interacting with the OG Reputation Spaces Solana program (`V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX`).

Rename note: this project was previously documented as "Vine Reputation". The on-chain program ID and exported constant name `VINE_REP_PROGRAM_ID` remain unchanged for backward compatibility.

## Installation

```bash
npm install @grapenpm/vine-reputation-client @solana/web3.js
```

## Quick Start

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import {
  fetchConfig,
  fetchAllSpaces,
  fetchReputationsForDaoSeason,
} from '@grapenpm/vine-reputation-client';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const daoId = new PublicKey('YOUR_DAO_ID');

const config = await fetchConfig(connection, daoId);
console.log('Current season:', config?.currentSeason);

const spaces = await fetchAllSpaces(connection);
console.log('Indexed spaces:', spaces.length);

const leaderboard = await fetchReputationsForDaoSeason({
  conn: connection,
  daoId,
  season: config?.currentSeason ?? 1,
  limit: 10,
});
console.log('Top wallet:', leaderboard[0]?.user.toBase58());
```

## What's Implemented

### 1) Space discovery and indexing

- `fetchAllSpaces(conn, programId?)`
- `fetchAllSpacesGPA(conn, programId?)`

Both scan the program for active OG Reputation Spaces and return `VineSpace[]` records with DAO ID, authority, mint, season, and config PDA.

`fetchAllSpaces` uses filtered GPA queries for efficiency.
`fetchAllSpacesGPA` scans all program accounts, which is useful as a fallback when custom RPC behavior interferes with filters.

Both methods also verify each PDA against decoded account contents, which prevents false positives.

### 2) Season leaderboard / reputation query support

- `fetchReputationsForDaoSeason({ conn, daoId, season, limit?, commitment?, programId? })`

This helper:
- Fetches matching accounts with RPC memcmp filters.
- Supports both old and new reputation account layouts.
- De-duplicates accounts returned by overlapping query paths.
- Validates reputation PDA derivation for DAO + user + season.
- Returns results sorted by `points` descending.

### 3) Full config and governance builders

- `buildInitializeConfigIx`
- `buildSetAuthorityIx`
- `buildSetSeasonIx`
- `buildSetDecayBpsIx`
- `buildSetRepMintIx`
- `buildCloseConfigIx`

These cover full lifecycle management of a space's config account.

### 4) Delegate permission management

- `buildAddDelegateIx`
- `buildUpdateDelegateIx`
- `buildRemoveDelegateIx`
- `fetchDelegate`

Delegate permissions are explicit booleans:
- `canAward`
- `canReset`

### 5) Reputation lifecycle operations

- `buildAddReputationIx`
- `buildAddReputationPointsIx`
- `buildResetReputationIx`
- `buildTransferReputationIx`
- `buildCloseReputationIx`
- `fetchReputation`

These builders enforce season consistency client-side by reading config first and rejecting mismatched season writes.

### 6) Project metadata management

- `buildUpsertProjectMetadataIx`
- `fetchProjectMetadata`
- `getProjectMetaPda`

### 7) Admin and low-level debugging utilities

- `buildAdminCloseAnyIx`
- `ixDiscriminator`
- `accountDiscriminator`
- `discHex`
- `decodeReputationConfig`
- `decodeReputation`
- `decodeDelegate`
- `decodeProjectMetadata`

Useful for debugging, migrations, indexers, and custom analytics tooling.

## Core Concepts

### Space Config

Each DAO has a config account containing:
- `authority`
- `repMint`
- `currentSeason`
- `decayBps`

### Seasons

Reputation is season-scoped. Most write builders validate that provided `season` matches the config's current season.

### Delegates

Authority can grant limited write permissions to delegate wallets:
- award-only (`canAward`)
- reset-enabled (`canReset`)

## Common API Usage

### Fetch Configuration

```typescript
import { fetchConfig } from '@grapenpm/vine-reputation-client';

const config = await fetchConfig(connection, daoId);
if (config) {
  console.log('Authority:', config.authority.toBase58());
  console.log('Season:', config.currentSeason);
  console.log('Decay BPS:', config.decayBps);
}
```

### Fetch Space Metadata

```typescript
import { fetchProjectMetadata } from '@grapenpm/vine-reputation-client';

const metadata = await fetchProjectMetadata(connection, daoId);
console.log('Metadata URI:', metadata?.metadataUri);
```

### Build Add Reputation Instruction

```typescript
import { buildAddReputationIx } from '@grapenpm/vine-reputation-client';

const { ix } = await buildAddReputationIx({
  conn: connection,
  daoId,
  authority: authorityWallet.publicKey,
  payer: payerWallet.publicKey,
  user: userWallet.publicKey,
  amount: 100n,
  season: 3, // optional; defaults to config.currentSeason
});
```

### Build Delegate Instruction

```typescript
import { buildAddDelegateIx } from '@grapenpm/vine-reputation-client';

const ix = await buildAddDelegateIx({
  daoId,
  authority: authorityWallet.publicKey,
  delegateWallet: moderatorWallet.publicKey,
  canAward: true,
  canReset: false,
  payer: payerWallet.publicKey,
});
```

### Fetch Top N for a Season

```typescript
import { fetchReputationsForDaoSeason } from '@grapenpm/vine-reputation-client';

const top10 = await fetchReputationsForDaoSeason({
  conn: connection,
  daoId,
  season: 4,
  limit: 10,
});

for (const row of top10) {
  console.log(row.user.toBase58(), row.points.toString());
}
```

## Exported Types

```typescript
import type {
  ReputationConfigAccount,
  ReputationAccount,
  DelegateAccount,
  ProjectMetadataAccount,
  VineSpace,
  RepRow,
} from '@grapenpm/vine-reputation-client';
```

## License

MIT

## Support

- Program ID: `V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX`
