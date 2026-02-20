# Instadapp Autonomous Searcher Bot (Node.js)

Autonomous searcher bot that integrates with **Instadapp DSA (dsa-sdk)** to execute
flash-loan-backed arbitrage and liquidation spells.

Implemented capabilities:

- **Connection & key management**
  - Instantiates Instadapp SDK in `mode: "node"` with private key loading from:
    1) AWS Secrets Manager, or
    2) encrypted env blob, or
    3) plain `.env` fallback.
  - Binds to an existing DSA via `await dsa.setInstance(dsaID)`.
- **Monitoring brain (ethers.js + high-speed RPC)**
  - Arbitrage polling across **Uniswap V3**, **SushiSwap**, **Curve**.
  - Liquidation watchers for **Aave V3** health factor and **Compound** liquidatability.
  - Cross-chain spread monitor (Mainnet/Base/Arbitrum) with **Avocado cross-chain balance fetching** context.
- **Execution engine**
  - Builds `dsa.cast` transaction payloads (via `dsa.castTxObj`) with flashloan + swap/liquidation + payback spell flow.
  - Executes privately with Flashbots (`@flashbots/ethers-provider-bundle`).
- **Security & automation**
  - Kill-switch stops operation if gas wallet ETH falls below threshold.
  - Configurable public mempool fallback (disabled by default).

---

## Important Security Model

- Use a **dedicated hot wallet** private key with limited ETH for gas only (for example `0.1 - 0.5 ETH`).
- Trading capital comes from flash loans; your key risk is gas balance + operational mistakes.
- Prefer:
  - **AWS Secrets Manager** (`PRIVATE_KEY_SECRET_ID`, `AWS_REGION`), or
  - encrypted env key (`PRIVATE_KEY_ENCRYPTED`, `ENV_ENCRYPTION_KEY`).

Generate encrypted env payload:

```bash
HOT_WALLET_PRIVATE_KEY=0xyour_hot_wallet_key \
ENV_ENCRYPTION_PASSPHRASE="strong-passphrase" \
npm run encrypt:key
```

---

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template:

```bash
cp .env.example .env
```

3. Configure at minimum:
   - `DSA_ID`
   - `ETHEREUM_RPC_URL` (QuickNode/Alchemy recommended)
   - one private key source:
     - `PRIVATE_KEY` (dev only), or
     - `PRIVATE_KEY_ENCRYPTED` + `ENV_ENCRYPTION_KEY`, or
     - `PRIVATE_KEY_SECRET_ID` + `AWS_REGION`
   - `USE_FLASHBOTS=true`
   - strategy JSONs (`ARBITRAGE_PAIRS_JSON`, `LIQUIDATION_POSITIONS_JSON`, etc.)

4. Validate module loading:

```bash
npm run check
```

5. Safe dry run (single cycle):

```bash
npm run dry-run
```

6. Start bot:

```bash
npm run start
```

---

## Runtime Modes

- `npm run start`  
  continuous polling mode.
- `npm run start:once`  
  execute one monitor/execution cycle.
- `npm run dry-run`  
  single cycle with execution disabled.

---

## Strategy Configuration

### 1) Arbitrage pairs

`ARBITRAGE_PAIRS_JSON` expects objects with:

- chain, token pair, trade size
- enabled quote sources (UniswapV3/Sushi/Curve)
- minimum spread threshold

### 2) Liquidation positions

`LIQUIDATION_POSITIONS_JSON` expects watched borrowers with protocol details:

- Aave V3: `poolAddress`, `liquidationHealthFactor`
- Compound V2: `comptrollerAddress`
- Compound V3: `cometAddress`

### 3) Cross-chain spreads

`CROSS_CHAIN_PAIRS_JSON` compares same pair across chain IDs and attaches Avocado balances.

### 4) Spell templates

`EXECUTION_TEMPLATES_JSON` can override default Instadapp spell steps:

- `arbitrageInnerSteps`
- `liquidationInnerSteps`
- `liquidationInnerStepsByProtocol` (recommended for `aave-v3`, `compound-v2`, `compound-v3`)
- `crossChainInnerSteps`

Each step follows:

```json
{ "connector": "oneInch", "method": "sell", "args": ["..."] }
```

Placeholders like `{{tokenIn}}`, `{{flashLoanAmountWei}}`, `{{borrower}}` are substituted at runtime.

---

## Architecture Map

- `src/config.js`  
  env parsing, risk settings, strategy JSONs.
- `src/security/secrets.js`  
  AWS + encrypted env private key loading.
- `src/instadappClient.js`  
  DSA init in node mode + `setInstance`.
- `src/arbitrageMonitor.js`  
  DEX quote scanner and route evaluation.
- `src/liquidationMonitor.js`  
  Aave/Compound liquidation watcher.
- `src/crossChainMonitor.js`  
  L1/L2 spread checks + Avocado balance context.
- `src/spellBuilder.js`  
  Instadapp flashloan cast spell construction.
- `src/executionEngine.js`  
  profitability gate, kill-switch, private/public execution.
- `src/flashbotsExecutor.js`  
  Flashbots private transaction relay.

---

## Operational Notes

- This repository provides automation infrastructure, not guaranteed profitability.
- Always start in dry-run mode and test with small notional values.
- Production searchers usually need additional simulation, fallback routing, and re-org handling.