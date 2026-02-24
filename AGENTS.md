# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Instadapp Autonomous Searcher Bot — a Node.js DeFi automation engine that executes flash-loan-backed arbitrage and liquidation strategies via the Instadapp DSA SDK. Single-service Node.js app (not a monorepo). See `README.md` for full architecture details.

### Key commands

All commands are defined in `package.json`:

- **Lint:** `npm run lint`
- **Tests:** `npm test` (Jest, 106 unit tests, no external services needed — fully mocked)
- **Format check:** `npm run format:check`
- **Format fix:** `npm run format`
- **Dry run:** `npm run dry-run` (requires `.env` with `ETHEREUM_RPC_URL`, `PRIVATE_KEY`, `DSA_ID`)
- **Start with dashboard:** `npm run start:web` (serves web UI on port 3000)

### Running the application locally

The bot requires a `.env` file (copy from `.env.example`). At minimum set:

- `ETHEREUM_RPC_URL` — a valid Ethereum mainnet RPC (public RPCs like `https://eth.llamarpc.com` work for dev)
- `PRIVATE_KEY` — any valid Ethereum private key (for dev/dry-run, generate with `node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"`)
- `DSA_ID=1`

The bot's kill-switch safely halts if the wallet has insufficient gas ETH, so dry-run with a random key is safe.

### Gotchas

- `dsa.setInstance(dsaId)` makes a real RPC call during bootstrap — the app will not start without a working `ETHEREUM_RPC_URL`.
- Some public RPCs (e.g., Ankr) now require API keys. `https://eth.llamarpc.com` works without auth as of Feb 2026.
- The `AVOCADO_ENABLED` default is `true`; it makes external RPC calls at startup. Set `AVOCADO_ENABLED=false` in `.env` if you want fully offline unit testing only.
- Prettier reports style issues in 4 source files (`src/config.js`, `src/configSchemas.js`, `src/spellBuilder.js`, `scripts/encrypt-env.js`) — these are pre-existing and not introduced by agent changes.
- `.env` is gitignored. The `.env.example` template is committed. Never commit `.env`.
