# Vine Reputation Client

TypeScript client library for interacting with the Vine Reputation Solana program (`V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX`).

## Installation

```bash
npm install @noble/hashes bs58
npm install @solana/web3.js
```

## Quick Start

```typescript
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import {
  VINE_REP_PROGRAM_ID,
  getConfigPda,
  fetchConfig,
  buildInitializeConfigIx,
  buildAddReputationIx,
} from './vine-reputation-client';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const daoId = new PublicKey('YOUR_DAO_ID');

// Fetch config
const config = await fetchConfig(connection, daoId);
console.log('Current Season:', config?.currentSeason);
```

## Core Concepts

### DAOs and Configs

Each DAO has a unique configuration account that tracks:
- Current season
- Authority (admin wallet)
- Reputation mint
- Decay rate (basis points per season)

### Seasons

Reputation is tracked per season. The config determines which season is currently active.

### Delegates

Delegates are wallets granted specific permissions by the DAO authority:
- **can_award**: Permission to add reputation points
- **can_reset**: Permission to reset user reputation to zero

## PDA Functions

### Configuration PDAs

```typescript
// Get config PDA for a DAO
const [configPda, bump] = getConfigPda(daoId);

// Get project metadata PDA
const [metaPda, bump] = getProjectMetaPda(daoId);
```

### Reputation PDAs

```typescript
// Get reputation PDA for a user in a specific season
const [repPda, bump] = getReputationPda(
  configPda,
  userWallet,
  seasonNumber
);
```

### Delegate PDAs

```typescript
// Get delegate PDA
const [delegatePda, bump] = getDelegatePda(
  configPda,
  delegateWallet
);
```

## Account Types

### ReputationConfigAccount

```typescript
type ReputationConfigAccount = {
  version: number;
  daoId: PublicKey;
  authority: PublicKey;
  repMint: PublicKey;
  currentSeason: number;
  decayBps: number;  // 0-10000 (e.g., 3000 = 30% decay)
  bump: number;
}
```

### ReputationAccount

```typescript
type ReputationAccount = {
  version: number;
  user: PublicKey;
  season: number;
  points: bigint;
  lastUpdateSlot: bigint;
  bump: number;
}
```

### DelegateAccount

```typescript
type DelegateAccount = {
  version: number;
  config: PublicKey;
  delegate: PublicKey;
  canAward: boolean;
  canReset: boolean;
  bump: number;
}
```

### ProjectMetadataAccount

```typescript
type ProjectMetadataAccount = {
  version: number;
  daoId: PublicKey;
  metadataUri: string;  // max 256 chars
  bump: number;
}
```

## Fetching Data

### Fetch Configuration

```typescript
const config = await fetchConfig(connection, daoId);

if (config) {
  console.log('Authority:', config.authority.toBase58());
  console.log('Current Season:', config.currentSeason);
  console.log('Decay BPS:', config.decayBps);
}
```

### Fetch Reputation

```typescript
const reputation = await fetchReputation(
  connection,
  daoId,
  userWallet,
  seasonNumber
);

if (reputation) {
  console.log('Points:', reputation.points.toString());
  console.log('Season:', reputation.season);
}
```

### Fetch Delegate

```typescript
const delegate = await fetchDelegate(
  connection,
  configPda,
  delegateWallet
);

if (delegate) {
  console.log('Can Award:', delegate.canAward);
  console.log('Can Reset:', delegate.canReset);
}
```

### Fetch Project Metadata

```typescript
const metadata = await fetchProjectMetadata(connection, daoId);

if (metadata) {
  console.log('Metadata URI:', metadata.metadataUri);
}
```

### Fetch All Reputation Spaces

```typescript
// Efficiently fetch all reputation spaces using filters
const spaces = await fetchAllSpaces(connection);

for (const space of spaces) {
  console.log('DAO:', space.daoId.toBase58());
  console.log('Season:', space.currentSeason);
  console.log('Authority:', space.authority.toBase58());
}
```

### Fetch All Reputations for a Season

```typescript
const reputations = await fetchReputationsForDaoSeason({
  conn: connection,
  daoId,
  season: 1,
  limit: 1000,  // optional, default 50000
  commitment: 'confirmed'  // optional
});

// Results are sorted by points (descending)
for (const rep of reputations) {
  console.log(`${rep.user.toBase58()}: ${rep.points} points`);
}
```

## Initialize a DAO

```typescript
const ix = await buildInitializeConfigIx({
  daoId: new PublicKey('YOUR_DAO_ID'),
  repMint: new PublicKey('YOUR_REP_MINT'),
  initialSeason: 1,
  authority: authorityWallet.publicKey,
  payer: payerWallet.publicKey,
});

// Add to transaction and send
const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [payerWallet]);
```

## Configuration Management

### Set Authority

```typescript
const ix = await buildSetAuthorityIx({
  daoId,
  authority: currentAuthority.publicKey,  // signer
  newAuthority: newAuthorityWallet.publicKey,
});
```

### Set Season

```typescript
const ix = await buildSetSeasonIx({
  daoId,
  authority: authorityWallet.publicKey,  // signer
  newSeason: 2,
});
```

### Set Decay Rate

```typescript
// Set 30% decay per season (3000 basis points)
const ix = await buildSetDecayBpsIx({
  daoId,
  authority: authorityWallet.publicKey,  // signer
  decayBps: 3000,  // 0-10000
});
```

### Set Reputation Mint

```typescript
const ix = await buildSetRepMintIx({
  daoId,
  authority: authorityWallet.publicKey,  // signer
  newRepMint: newMintAddress,
});
```

## Delegate Management

### Add a Delegate

Grant specific permissions to another wallet:

```typescript
const ix = await buildAddDelegateIx({
  daoId,
  authority: authorityWallet.publicKey,  // signer (must be config authority)
  delegateWallet: delegateAddress,
  canAward: true,   // can add reputation points
  canReset: false,  // cannot reset reputation
  payer: payerWallet.publicKey,  // signer
});

const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [authorityWallet, payerWallet]);
```

### Update Delegate Permissions

Change an existing delegate's permissions:

```typescript
const ix = await buildUpdateDelegateIx({
  daoId,
  authority: authorityWallet.publicKey,  // signer
  delegateWallet: delegateAddress,
  canAward: true,
  canReset: true,  // now can also reset
});

const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [authorityWallet]);
```

### Remove a Delegate

Revoke all permissions and close the delegate account:

```typescript
const ix = await buildRemoveDelegateIx({
  daoId,
  authority: authorityWallet.publicKey,  // signer
  delegateWallet: delegateAddress,
  recipient: authorityWallet.publicKey,  // receives reclaimed lamports
});

const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [authorityWallet]);
```

## Reputation Management

### Add Reputation Points

Authority or authorized delegates can award points:

```typescript
const { ix } = await buildAddReputationIx({
  conn: connection,
  daoId,
  authority: authorityWallet.publicKey,  // signer (authority or delegate)
  payer: payerWallet.publicKey,  // signer
  user: userWallet.publicKey,
  amount: 100n,  // bigint
  season: 1,  // optional, defaults to current season
});

const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [authorityWallet, payerWallet]);
```

**Note:** The instruction automatically handles reputation account creation if it doesn't exist.

### Reset Reputation

Authority or authorized delegates can reset a user's points to zero:

```typescript
const { ix } = await buildResetReputationIx({
  conn: connection,
  daoId,
  authority: authorityWallet.publicKey,  // signer (authority or delegate)
  user: userWallet.publicKey,
  season: 1,  // optional, defaults to current season
});

const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [authorityWallet]);
```

### Transfer Reputation Between Wallets

Move all reputation points from one wallet to another (authority only):

```typescript
const ix = await buildTransferReputationIx({
  conn: connection,
  daoId,
  authority: authorityWallet.publicKey,  // signer
  payer: payerWallet.publicKey,  // signer
  oldWallet: oldUserWallet.publicKey,
  newWallet: newUserWallet.publicKey,
  season: 1,  // optional, defaults to current season
});

const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [authorityWallet, payerWallet]);
```

## Project Metadata

### Set or Update Metadata

```typescript
const ix = await buildUpsertProjectMetadataIx({
  daoId,
  authority: authorityWallet.publicKey,  // signer
  payer: payerWallet.publicKey,  // signer
  metadataUri: 'https://example.com/metadata.json',  // max 256 chars
});

const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [authorityWallet, payerWallet]);
```

## Cleanup Operations

### Close Reputation Account

Close a reputation account for a specific season (authority only):

```typescript
const { ix } = await buildCloseReputationIx({
  daoId,
  user: userWallet.publicKey,
  season: 0,  // explicit season number
  authority: authorityWallet.publicKey,  // signer
  recipient: authorityWallet.publicKey,  // receives reclaimed lamports
});

const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [authorityWallet]);
```

### Close Config

Close the entire DAO configuration (authority only):

```typescript
const ix = await buildCloseConfigIx({
  daoId,
  authority: authorityWallet.publicKey,  // signer
  recipient: authorityWallet.publicKey,  // receives reclaimed lamports
});

const tx = new Transaction().add(ix);
await sendAndConfirmTransaction(connection, tx, [authorityWallet]);
```

### Emergency Admin Close

Special admin-only instruction to force-close any program-owned account:

```typescript
const ix = await buildAdminCloseAnyIx({
  target: stuckAccountPda,
  authority: adminWallet.publicKey,  // must be ADMIN constant
  recipient: adminWallet.publicKey,
});

// Only works if authority == ADMIN on-chain
```

## Permission Model

### Authority (Config Owner)
- Can do everything
- Set authority, season, decay, mint
- Add/update/remove delegates
- Award/reset reputation
- Transfer reputation
- Close accounts
- Update metadata

### Delegates
Delegates have limited permissions based on their configuration:

**can_award = true**
- Can add reputation points to users
- Cannot modify points, only increment

**can_reset = true**
- Can reset user reputation to zero
- Destructive operation requiring explicit permission

**Delegates CANNOT:**
- Change config settings
- Manage other delegates
- Transfer reputation between wallets
- Close accounts
- Update metadata

## Common Patterns

### Check if Wallet is Delegate

```typescript
const [configPda] = getConfigPda(daoId);
const delegate = await fetchDelegate(connection, configPda, walletAddress);

if (delegate) {
  if (delegate.canAward) {
    console.log('Can award reputation');
  }
  if (delegate.canReset) {
    console.log('Can reset reputation');
  }
} else {
  console.log('Not a delegate');
}
```

### Season-Based Leaderboard

```typescript
const season = 5;
const reputations = await fetchReputationsForDaoSeason({
  conn: connection,
  daoId,
  season,
  limit: 10,  // top 10
});

console.log(`Season ${season} Leaderboard:`);
reputations.forEach((rep, index) => {
  console.log(`${index + 1}. ${rep.user.toBase58()}: ${rep.points} points`);
});
```

### Batch Award Reputation

```typescript
const users = [
  { wallet: user1, points: 50n },
  { wallet: user2, points: 75n },
  { wallet: user3, points: 100n },
];

const instructions = await Promise.all(
  users.map(({ wallet, points }) =>
    buildAddReputationIx({
      conn: connection,
      daoId,
      authority: authorityWallet.publicKey,
      payer: payerWallet.publicKey,
      user: wallet,
      amount: points,
    }).then(result => result.ix)
  )
);

const tx = new Transaction().add(...instructions);
await sendAndConfirmTransaction(connection, tx, [authorityWallet, payerWallet]);
```

### Multi-Delegate Setup

```typescript
// Moderator can only award points
const addModIx = await buildAddDelegateIx({
  daoId,
  authority: authorityWallet.publicKey,
  delegateWallet: moderatorWallet,
  canAward: true,
  canReset: false,
  payer: payerWallet.publicKey,
});

// Admin can award and reset
const addAdminIx = await buildAddDelegateIx({
  daoId,
  authority: authorityWallet.publicKey,
  delegateWallet: adminWallet,
  canAward: true,
  canReset: true,
  payer: payerWallet.publicKey,
});

const tx = new Transaction().add(addModIx, addAdminIx);
await sendAndConfirmTransaction(connection, tx, [authorityWallet, payerWallet]);
```

## Error Handling

The library throws errors for common issues:

```typescript
try {
  const { ix } = await buildAddReputationIx({
    conn: connection,
    daoId,
    authority: authorityWallet.publicKey,
    payer: payerWallet.publicKey,
    user: userWallet.publicKey,
    amount: 100n,
    season: 999,  // wrong season
  });
} catch (error) {
  if (error.message.includes('SeasonMismatch')) {
    console.error('Season does not match current season');
  } else if (error.message.includes('Config PDA not found')) {
    console.error('DAO not initialized');
  }
}
```

Common errors:
- `SeasonMismatch`: Provided season doesn't match config's current season
- `Config PDA not found`: DAO hasn't been initialized
- `Unauthorized`: Signer is not the authority or a valid delegate
- `Invalid config.currentSeason`: Config data is corrupted
- `decayBps must be 0..=10000`: Invalid decay rate

## Advanced Usage

### Custom Program ID

All functions accept an optional `programId` parameter:

```typescript
const CUSTOM_PROGRAM_ID = new PublicKey('YOUR_PROGRAM_ID');

const [configPda] = getConfigPda(daoId, CUSTOM_PROGRAM_ID);
const config = await fetchConfig(connection, daoId, CUSTOM_PROGRAM_ID);
```

### Discriminator Debugging

```typescript
import { ixDiscriminator, accountDiscriminator, discHex } from './vine-reputation-client';

// Check instruction discriminator
const disc = await ixDiscriminator('addReputation');
console.log('add_reputation discriminator:', discHex(disc));

// Check account discriminator
const accDisc = await accountDiscriminator('Reputation');
console.log('Reputation account discriminator:', discHex(accDisc));
```

## TypeScript Types

All functions are fully typed. Import types as needed:

```typescript
import type {
  ReputationConfigAccount,
  ReputationAccount,
  DelegateAccount,
  ProjectMetadataAccount,
  VineSpace,
  RepRow,
} from './vine-reputation-client';
```

## License

MIT

## Support

- Program ID: `V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX`
- GitHub: [Your Repository]
- Documentation: [Your Docs]