# 🍇 Vine Reputation Client

A lightweight, composable **TypeScript client** for interacting with the **Vine Reputation Program** on Solana.

This package provides:
- PDA helpers
- account decoders
- read APIs (fetch config, reputation, metadata)
- instruction builders (initialize, add/reset/transfer reputation, admin actions)

Designed for **DAOs, governance apps, leaderboards, badges, and reputation systems**.

---

## ✨ Why Vine Reputation?

Vine Reputation enables DAOs to:
- Assign **non-transferable reputation points**
- Track reputation **per season**
- Support **governance weighting**, **leaderboards**, **badges**, and **access control**
- Keep logic **on-chain**, UI **off-chain**, and tooling **open**

This client makes the program easy to integrate without Anchor or manual IDL parsing.

---

## 📦 Installation

```bash
npm install @grapenpm/vine-reputation-client
```

---
or
---

```bash
yarn add @grapenpm/vine-reputation-client
```

---

## 🔑 PDA Helpers

Derive all PDAs used by the Vine Reputation program.

```ts
import {
  getConfigPda,
  getReputationPda,
  getProjectMetaPda,
} from "@grapenpm/vine-reputation-client";
import { PublicKey } from "@solana/web3.js";

const daoId = new PublicKey("DAO_PUBLIC_KEY");

const [configPda] = getConfigPda(daoId);
const [projectMetaPda] = getProjectMetaPda(daoId);
```

Fetch Reputation Config
```ts
import { fetchConfig } from "@grapenpm/vine-reputation-client";
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");

const config = await fetchConfig(connection, daoId);

console.log("Authority:", config.authority.toBase58());
console.log("Current season:", config.currentSeason);
console.log("Reputation mint:", config.repMint.toBase58());
```

## Fetch User Reputation
```ts
import { fetchReputation } from "@grapenpm/vine-reputation-client";
import { PublicKey } from "@solana/web3.js";

const user = new PublicKey("USER_WALLET");

const reputation = await fetchReputation(
  connection,
  daoId,
  user,
  config.currentSeason
);

console.log("Reputation points:", reputation?.amount.toString());
```

## Fetch Project Metadata (for UI Customization)
```ts
import { fetchProjectMetadata } from "@grapenpm/vine-reputation-client";

const meta = await fetchProjectMetadata(connection, daoId);

console.log("Metadata URI:", meta?.metadataUri);
```

## Initialize a Reputation Space
```ts
import { buildInitializeConfigIx } from "@grapenpm/vine-reputation-client";

const ix = await buildInitializeConfigIx({
  daoId,
  repMint,
  initialSeason: 1,
  authority: wallet.publicKey,
  payer: wallet.publicKey,
});
```

## Add Reputation Points
```ts
import { buildAddReputationIx } from "@grapenpm/vine-reputation-client";

const ix = await buildAddReputationIx({
  daoId,
  authority: wallet.publicKey,
  payer: wallet.publicKey,
  user,
  amount: BigInt(10),
  currentSeason: config.currentSeason,
});
```

## Reset or Transfer Reputation
```ts
buildResetReputationIx(...)
buildTransferReputationIx(...)
```
### How to set decay (global, on ReputationConfig)
```ts
import {
  buildSetDecayBpsIx,
  VINE_REP_PROGRAM_ID,
} from "@grapenpm/vine-reputation-client";
import { Transaction } from "@solana/web3.js";

// 30% decay per season
const decayBps = 3000;

const ix = await buildSetDecayBpsIx({
  daoId,
  authority: wallet.publicKey, // MUST be config.authority
  decayBps,
});

const tx = new Transaction().add(ix);
const sig = await wallet.sendTransaction(tx, connection);
await connection.confirmTransaction(sig, "confirmed");
```

### How to fetch & use decay
```ts
const config = await fetchConfig(connection, daoId);
const decayBps = config?.decayBps ?? 0;

const w0 = seasonWeight(decayBps, 0); // 1.0
const w1 = seasonWeight(decayBps, 1); // 0.7 (if 30%)
const w2 = seasonWeight(decayBps, 2); // 0.49
```

## Close Accounts (Danger Zone)
```ts
buildCloseConfigIx(...)
buildCloseReputationIx(...)
buildCloseProjectMetadataIx(...)
```

## Use Cases
	•	DAO governance weighting
	•	Contributor reputation
	•	Leaderboards
	•	Badges & access tiers
	•	Delegation signals
	•	Anti-sybil scoring
	•	Community incentives

## Philosophy

Vine Reputation is:
	•	Composable – small, focused primitives
	•	Permissioned – authority-controlled
	•	Transparent – on-chain state
	•	UI-agnostic – bring your own frontend
