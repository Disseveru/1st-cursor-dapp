# Instadapp Arbitrage & Liquidation Bot

Autonomous Node.js searcher bot that integrates with the **Instadapp DeFi Smart Account (DSA)** protocol to execute flash-loan-backed arbitrage and liquidations across multiple DeFi protocols and chains.

## Architecture

```
src/
├── config/
│   ├── index.js          # Environment config loader
│   ├── constants.js       # Contract addresses, ABIs, connector names
│   ├── dsaConnection.js   # DSA SDK + ethers wallet initialisation
│   └── keyManager.js      # AES-256-GCM encryption & AWS Secrets Manager
├── monitors/
│   ├── swapArbitrage.js   # Uniswap V3 / SushiSwap / Curve price polling
│   ├── liquidation.js     # Aave V3 & Compound V3 health factor scanning
│   └── crossChain.js      # Mainnet ↔ L2 price gap detection
├── execution/
│   ├── spellBuilder.js    # Flash-loan spell construction via DSA connectors
│   ├── gasEstimator.js    # Profitability checks (gross profit vs gas cost)
│   └── executor.js        # Spell casting with Flashbots fallback
├── security/
│   ├── flashbots.js       # Flashbots bundle provider (MEV protection)
│   └── killSwitch.js      # ETH balance threshold halt mechanism
├── utils/
│   └── logger.js          # Winston structured logging
└── index.js               # Main orchestrator — launches all loops
```

## Features

### 1. Connection & Key Management
- Instadapp DSA SDK (`dsa-connect`) instantiated in `mode: 'node'` with a `privateKey`.
- `dsa.setInstance(dsaID)` links the bot to a pre-deployed DeFi Smart Account.
- Private key resolved from (in priority order):
  1. **AWS Secrets Manager** — set `USE_AWS_SECRETS=true`
  2. **Encrypted file** — AES-256-GCM at rest via `ENCRYPT_KEY_AT_REST=true`
  3. **Plain `.env`** — fallback (not recommended for production)

### 2. The Monitor (The Brain)
- **Swap Arbitrage**: Polls prices for the same token pair on Uniswap V3, SushiSwap, and Curve every `POLL_INTERVAL_ARB` ms.
- **Liquidation**: Scans Aave V3 `getUserAccountData()` health factors and Compound V3 `isLiquidatable()` every `POLL_INTERVAL_LIQ` ms. Auto-discovers borrowers from recent on-chain events.
- **Cross-Chain**: Compares WETH/USDC prices on Mainnet vs Arbitrum/Base using Uniswap V3 Quoter on each chain.

### 3. Execution Engine (The Spell)
When profit > gas cost:
1. **Flash Borrow** via `INSTAPOOL-C` connector — borrows required capital with zero upfront.
2. **Swap** via `UNISWAP-V3-A` connector — executes the buy/sell legs.
3. **Repay** — closes the flash loan within the same transaction.

All encoded as a single `dsa.cast()` call — atomic, single-block execution.

### 4. Automation & Security
- **Flashbots**: Transactions are submitted through the Flashbots relay, bypassing the public mempool to prevent front-running.
- **Kill-Switch**: If the gas wallet balance drops below `MIN_ETH_BALANCE`, all operations halt immediately.
- **Graceful Shutdown**: Handles SIGINT/SIGTERM for clean exit.

## Quick Start

### Prerequisites
- Node.js >= 20
- An Ethereum RPC endpoint (QuickNode or Alchemy recommended for low latency)
- A dedicated hot wallet with 0.1–0.5 ETH for gas
- A deployed Instadapp DSA (create one at [instadapp.io](https://instadapp.io))

### Setup

```bash
# Clone and install
git clone <repo-url> && cd instadapp-arbitrage-liquidation-bot
npm install --legacy-peer-deps

# Configure
cp .env.example .env
# Edit .env with your values (RPC URLs, private key, DSA ID)

# Run
npm start

# Monitor-only mode (no execution, just logs opportunities)
npm run monitor
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | Yes* | Hot wallet private key (no 0x prefix) |
| `DSA_ID` | Yes | Instadapp DSA ID |
| `RPC_URL_MAINNET` | Yes | Ethereum mainnet RPC |
| `RPC_URL_ARBITRUM` | No | Arbitrum RPC (enables cross-chain) |
| `RPC_URL_BASE` | No | Base RPC (enables cross-chain) |
| `FLASHBOTS_RELAY_URL` | No | Defaults to `https://relay.flashbots.net` |
| `MIN_ETH_BALANCE` | No | Kill-switch threshold (default: 0.05 ETH) |
| `POLL_INTERVAL_ARB` | No | Arbitrage poll interval ms (default: 3000) |
| `POLL_INTERVAL_LIQ` | No | Liquidation poll interval ms (default: 5000) |
| `MIN_PROFIT_ARB` | No | Min profit in ETH to execute (default: 0.005) |
| `ENCRYPT_KEY_AT_REST` | No | Enable AES-256-GCM key encryption |
| `USE_AWS_SECRETS` | No | Pull key from AWS Secrets Manager |

*Not required if using AWS Secrets Manager or encrypted key file.

## Security Recommendations

1. **Never use your main wallet.** Create a dedicated hot wallet that only holds gas funds. All trading capital comes from flash loans.
2. **Enable key encryption** (`ENCRYPT_KEY_AT_REST=true`) or **AWS Secrets Manager** (`USE_AWS_SECRETS=true`) so the private key is never stored in plain text.
3. **Use Flashbots** to prevent MEV extraction from your transactions. The bot automatically routes through the Flashbots relay.
4. **Set a conservative kill-switch threshold** to prevent draining gas funds on failing transactions.
5. **Run on a private server** (not a shared host) to protect the key in memory.

## How It Works

```
┌─────────────────────────────────────────────────┐
│                 Main Orchestrator                │
│  Launches 3 concurrent monitoring loops         │
└──────────────┬──────────┬──────────┬────────────┘
               │          │          │
   ┌───────────▼──┐  ┌────▼─────┐  ┌▼────────────┐
   │  Arb Monitor │  │ Liq Mon. │  │ Cross-Chain  │
   │  Uni/Sushi/  │  │ Aave V3  │  │ Mainnet vs  │
   │  Curve polls │  │ Comp V3  │  │ Arb / Base   │
   └──────┬───────┘  └────┬─────┘  └──────┬──────┘
          │               │               │
          ▼               ▼               ▼
   ┌──────────────────────────────────────────────┐
   │            Profitability Check                │
   │  gross_profit > gas_cost ?                   │
   └──────────────────┬───────────────────────────┘
                      │ YES
                      ▼
   ┌──────────────────────────────────────────────┐
   │          Spell Builder (DSA)                 │
   │  1. Flash Borrow (INSTAPOOL-C)              │
   │  2. Swap / Liquidate (UNISWAP-V3-A etc.)   │
   │  3. Repay Flash Loan                        │
   └──────────────────┬───────────────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────────────┐
   │         Flashbots MEV Protection             │
   │  Submit bundle → relay.flashbots.net         │
   │  Fallback → public mempool                   │
   └──────────────────┬───────────────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────────────┐
   │           Kill-Switch Guard                  │
   │  Balance < threshold → HALT                  │
   └──────────────────────────────────────────────┘
```

## License

MIT
