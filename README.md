# Instadapp Autonomous Searcher Bot

A Node.js bot that integrates with the **Instadapp DeFi Smart Layer (DSL)** to execute flash-loan-backed arbitrage and liquidations. Transactions are optionally routed through **Flashbots** for MEV protection.

## Architecture

```
src/
├── config/
│   ├── settings.js      # Env loader with AES-256-GCM encryption support
│   ├── addresses.js      # On-chain contract addresses & token pairs
│   └── abis.js           # Minimal ABI fragments
├── connection/
│   ├── provider.js       # Ethers.js providers + wallet initialisation
│   └── dsa.js            # Instadapp DSA wrapper (cast, setInstance)
├── monitors/
│   ├── arbitrageScanner.js    # Polls Uniswap V3, SushiSwap, Curve for price gaps
│   ├── liquidationScanner.js  # Watches Aave V3 + Compound V3 health factors
│   └── crossChainScanner.js   # Compares ETH/USD across Mainnet, Arbitrum, Base
├── execution/
│   ├── spellBuilder.js   # Constructs dsa.cast() spell sequences
│   └── executor.js       # Profitability check → Flashbots or direct execution
├── security/
│   ├── flashbots.js      # Flashbots bundle provider & submission
│   └── killSwitch.js     # Auto-halt when gas wallet runs low
├── utils/
│   ├── logger.js         # Winston structured logger
│   └── helpers.js        # sleep, retry, formatting utilities
└── index.js              # Main orchestrator / entry point
```

## How It Works

### 1. Monitor (the "Brain")

The bot continuously polls three data sources:

| Scanner | Data Source | Trigger |
|---|---|---|
| **Arbitrage** | Uniswap V3, SushiSwap, Curve | Price spread > 10 bps across DEXes |
| **Liquidation** | Aave V3 health factors, Compound V3 `isLiquidatable` | Health factor < 1.0 |
| **Cross-chain** | Chainlink ETH/USD feeds on Mainnet, Arbitrum, Base | Price gap > 20 bps |

### 2. Execution Engine (the "Spell")

When a profitable opportunity is found the engine:

1. **Flash-borrows** capital via the Instadapp `INSTAPOOL-C` connector.
2. **Executes** the swap or liquidation through protocol-specific connectors.
3. **Repays** the flash loan within the same transaction.
4. **Withdraws** profit to the bot wallet.

All steps are bundled into a single `dsa.cast()` call — atomic and revert-safe.

### 3. MEV Protection

If a `FLASHBOTS_AUTH_SIGNER_KEY` is configured the bot will:

- Simulate the bundle off-chain first.
- Send the signed bundle directly to Flashbots miners (bypasses the public mempool).
- Wait for inclusion in the target block.

### 4. Kill-Switch

The bot checks its wallet balance every cycle. If ETH drops below `MIN_ETH_BALANCE` all operations are halted to prevent wasting gas on failing transactions.

## Prerequisites

- **Node.js** ≥ 18
- An Ethereum RPC endpoint (QuickNode or Alchemy recommended)
- A **dedicated hot-wallet** private key (never use your main wallet)
- A pre-deployed Instadapp DSA (DeFi Smart Account) ID

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> && cd instadapp-arbitrage-liquidation-bot
npm install

# 2. Configure
cp .env.example .env
# Fill in PRIVATE_KEY, DSA_ID, RPC URLs, etc.

# 3. Run
npm start
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | Yes | Hot-wallet private key (no `0x` prefix) |
| `DSA_ID` | Yes | On-chain Instadapp DSA ID |
| `RPC_URL_MAINNET` | Yes | Ethereum mainnet RPC |
| `RPC_URL_ARBITRUM` | No | Arbitrum RPC (for cross-chain scanning) |
| `RPC_URL_BASE` | No | Base RPC (for cross-chain scanning) |
| `FLASHBOTS_RELAY_URL` | No | Defaults to `https://relay.flashbots.net` |
| `FLASHBOTS_AUTH_SIGNER_KEY` | No | Separate key for Flashbots auth |
| `MIN_ETH_BALANCE` | No | Kill-switch threshold (default `0.05` ETH) |
| `POLL_INTERVAL_MS` | No | Polling interval (default `2000` ms) |
| `MIN_PROFIT_THRESHOLD` | No | Min profit in ETH to execute (default `0.005`) |
| `ENV_ENCRYPTION_KEY` | No | 32-byte hex key to decrypt `PRIVATE_KEY` at rest |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default `info`) |

## Encrypting Your Private Key

To avoid storing a plaintext private key in `.env`:

```bash
node -e "
  import { encrypt } from './src/config/settings.js';
  const key = crypto.randomBytes(32).toString('hex');
  console.log('ENV_ENCRYPTION_KEY=' + key);
  console.log('PRIVATE_KEY=' + encrypt('YOUR_RAW_KEY', key));
"
```

Paste both values into `.env`. On startup the bot decrypts the key in memory.

## Security Recommendations

- **Never** use your main wallet. Create a dedicated hot-wallet with 0.1–0.5 ETH.
- Trading capital comes from flash loans — your risk is limited to gas fees.
- For production deployments, use **AWS Secrets Manager** or **HashiCorp Vault** instead of a `.env` file.
- Always enable the Flashbots wrapper to prevent front-running.

## License

MIT
