const dotenv = require("dotenv");
const { z } = require("zod");
const { asBool, parseJSON, normalizePrivateKey } = require("./utils");
const { resolvePrivateKey } = require("./security/secrets");
const {
  validateArbitragePairs,
  validateLiquidationPositions,
  validateCrossChainPairs,
  validateExecutionTemplates,
} = require("./configSchemas");

const DEFAULT_ADDRESSES = {
  WETH_MAINNET: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
  DAI_MAINNET: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC_MAINNET: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  UNIV3_QUOTER_MAINNET: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
  SUSHI_ROUTER_MAINNET: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
  CURVE_3POOL_MAINNET: "0xbEbC44782C7dB0a1A60Cb6Fe97d0b483032FF1C7",
  AAVE_V3_POOL_MAINNET: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  COMPOUND_V2_COMPTROLLER_MAINNET: "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B",
};

const DEFAULT_ARBITRAGE_TEMPLATE = [
  {
    connector: "oneInch",
    method: "sell",
    // Borrowed tokenIn -> tokenOut on first leg.
    args: ["{{tokenIn}}", "{{tokenOut}}", "{{flashLoanAmountWei}}", "0", "0", "9001"],
  },
  {
    connector: "oneInch",
    method: "sell",
    // Swap back tokenOut -> tokenIn to repay flash loan.
    args: ["{{tokenOut}}", "{{tokenIn}}", "0", "0", "9001", "9002"],
  },
  {
    connector: "instapool_v2",
    method: "flashPayback",
    args: ["{{tokenIn}}", "0", "9002", "0"],
  },
];

const DEFAULT_LIQUIDATION_TEMPLATE = [
  {
    connector: "compound",
    method: "liquidate",
    args: [
      "{{borrower}}",
      "{{repayToken}}",
      "{{collateralToken}}",
      "{{flashLoanAmountWei}}",
      "0",
      "9001",
    ],
  },
  {
    connector: "oneInch",
    method: "sell",
    // Sell seized collateral back into repayToken before flash payback.
    args: ["{{collateralToken}}", "{{repayToken}}", "0", "0", "9001", "9002"],
  },
  {
    connector: "instapool_v2",
    method: "flashPayback",
    args: ["{{repayToken}}", "0", "9002", "0"],
  },
];

const DEFAULT_EXECUTION_TEMPLATES = {
  arbitrageInnerSteps: DEFAULT_ARBITRAGE_TEMPLATE,
  liquidationInnerSteps: DEFAULT_LIQUIDATION_TEMPLATE,
  // Explicit protocol mapping is safer for liquidation, where connector flows differ
  // across protocols.
  liquidationInnerStepsByProtocol: {
    "compound-v2": DEFAULT_LIQUIDATION_TEMPLATE,
  },
  crossChainInnerSteps: [],
};

function normalizeRpcMap(env) {
  const fromJson = parseJSON(env.CHAIN_RPC_JSON, {}, "CHAIN_RPC_JSON");
  const map = { ...fromJson };

  if (env.ETHEREUM_RPC_URL) map[1] = env.ETHEREUM_RPC_URL;
  if (env.BASE_RPC_URL) map[8453] = env.BASE_RPC_URL;
  if (env.ARBITRUM_RPC_URL) map[42161] = env.ARBITRUM_RPC_URL;
  if (env.AVOCADO_RPC_URL) map[634] = env.AVOCADO_RPC_URL;

  return Object.fromEntries(Object.entries(map).filter(([, value]) => Boolean(value)));
}

async function loadConfig({ logger, cliFlags }) {
  dotenv.config();
  const env = process.env;

  const privateKey = await resolvePrivateKey(env, logger);

  const primaryRpc = env.QUICKNODE_RPC_URL || env.ALCHEMY_RPC_URL || env.ETHEREUM_RPC_URL;

  const schema = z.object({
    DSA_ID: z.coerce.number().int().positive(),
    ETHEREUM_RPC_URL: z.string().url(),
    LOG_LEVEL: z.string().default("info"),
    POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2500),
    GAS_KILL_SWITCH_ETH: z.coerce.number().positive().default(0.05),
    MIN_PROFIT_ETH: z.coerce.number().nonnegative().default(0.002),
    FLASHLOAN_ROUTE: z.coerce.number().int().nonnegative().default(0),
    FLASHBOTS_RELAY_URL: z.string().url().default("https://relay.flashbots.net"),
    FLASHBOTS_MAX_BLOCKS: z.coerce.number().int().positive().default(6),
    GAS_MULTIPLIER: z.coerce.number().positive().default(1.15),
  });

  const parsed = schema.parse({
    DSA_ID: env.DSA_ID,
    ETHEREUM_RPC_URL: primaryRpc || env.ETHEREUM_RPC_URL,
    LOG_LEVEL: env.LOG_LEVEL || "info",
    POLL_INTERVAL_MS: env.POLL_INTERVAL_MS || 2500,
    GAS_KILL_SWITCH_ETH: env.GAS_KILL_SWITCH_ETH || 0.05,
    MIN_PROFIT_ETH: env.MIN_PROFIT_ETH || 0.002,
    FLASHLOAN_ROUTE: env.FLASHLOAN_ROUTE || 0,
    FLASHBOTS_RELAY_URL: env.FLASHBOTS_RELAY_URL || "https://relay.flashbots.net",
    FLASHBOTS_MAX_BLOCKS: env.FLASHBOTS_MAX_BLOCKS || 6,
    GAS_MULTIPLIER: env.GAS_MULTIPLIER || 1.15,
  });

  const rawArbitragePairs = parseJSON(
    env.ARBITRAGE_PAIRS_JSON,
    [
      {
        label: "DAI/USDC mainnet",
        chainId: 1,
        tokenIn: DEFAULT_ADDRESSES.DAI_MAINNET,
        tokenOut: DEFAULT_ADDRESSES.USDC_MAINNET,
        tokenInDecimals: 18,
        tokenOutDecimals: 6,
        amountIn: "25000",
        minProfitBps: 5,
        sources: {
          uniswapV3: {
            quoter: DEFAULT_ADDRESSES.UNIV3_QUOTER_MAINNET,
            fee: 100,
            enabled: true,
          },
          sushiswap: {
            router: DEFAULT_ADDRESSES.SUSHI_ROUTER_MAINNET,
            enabled: true,
          },
          curve: {
            pool: DEFAULT_ADDRESSES.CURVE_3POOL_MAINNET,
            tokenInIndex: 0,
            tokenOutIndex: 1,
            enabled: true,
          },
        },
      },
    ],
    "ARBITRAGE_PAIRS_JSON",
  );
  const arbitragePairs = validateArbitragePairs(rawArbitragePairs, logger);

  const rawLiquidationPositions = parseJSON(
    env.LIQUIDATION_POSITIONS_JSON,
    [],
    "LIQUIDATION_POSITIONS_JSON",
  );
  const liquidationPositions = validateLiquidationPositions(rawLiquidationPositions, logger);

  const rawCrossChainPairs = parseJSON(
    env.CROSS_CHAIN_PAIRS_JSON,
    [],
    "CROSS_CHAIN_PAIRS_JSON",
  );
  const crossChainPairs = validateCrossChainPairs(rawCrossChainPairs, logger);

  const rawExecutionTemplates = parseJSON(
    env.EXECUTION_TEMPLATES_JSON,
    DEFAULT_EXECUTION_TEMPLATES,
    "EXECUTION_TEMPLATES_JSON",
  );
  const validatedExecutionTemplates = validateExecutionTemplates(
    rawExecutionTemplates,
    logger,
  );
  const executionTemplates = {
    ...DEFAULT_EXECUTION_TEMPLATES,
    ...validatedExecutionTemplates,
    liquidationInnerStepsByProtocol: {
      ...DEFAULT_EXECUTION_TEMPLATES.liquidationInnerStepsByProtocol,
      ...(validatedExecutionTemplates.liquidationInnerStepsByProtocol || {}),
    },
  };

  const chainRpcUrls = normalizeRpcMap(env);

  if (!chainRpcUrls[1] && parsed.ETHEREUM_RPC_URL) {
    chainRpcUrls[1] = parsed.ETHEREUM_RPC_URL;
  }

  return {
    app: {
      logLevel: parsed.LOG_LEVEL,
      dryRun: cliFlags.dryRun || asBool(env.DRY_RUN, false),
      once: cliFlags.once || asBool(env.RUN_ONCE, false),
      pollIntervalMs: parsed.POLL_INTERVAL_MS,
      blockListener: asBool(env.BLOCK_LISTENER, false),
    },
    dsa: {
      dsaId: parsed.DSA_ID,
      privateKey,
      rpcUrl: parsed.ETHEREUM_RPC_URL,
      origin: env.DSA_ORIGIN || "0x0000000000000000000000000000000000000000",
    },
    providers: {
      chainRpcUrls,
      quicknodeRpcUrl: env.QUICKNODE_RPC_URL,
      alchemyRpcUrl: env.ALCHEMY_RPC_URL,
    },
    risk: {
      gasKillSwitchEth: parsed.GAS_KILL_SWITCH_ETH,
      minProfitEth: parsed.MIN_PROFIT_ETH,
      gasMultiplier: parsed.GAS_MULTIPLIER,
    },
    flashbots: {
      enabled: asBool(env.USE_FLASHBOTS, true),
      relayUrl: parsed.FLASHBOTS_RELAY_URL,
      authPrivateKey: env.FLASHBOTS_AUTH_PRIVATE_KEY
        ? normalizePrivateKey(env.FLASHBOTS_AUTH_PRIVATE_KEY)
        : "",
      maxBlocksInFuture: parsed.FLASHBOTS_MAX_BLOCKS,
      allowPublicFallback: asBool(env.ALLOW_PUBLIC_MEMPOOL_FALLBACK, false),
    },
    monitoring: {
      arbitragePairs,
      liquidationPositions,
      crossChainPairs,
    },
    execution: {
      flashloanRoute: parsed.FLASHLOAN_ROUTE,
      templates: executionTemplates,
      bridgeConnector: env.BRIDGE_CONNECTOR || "",
      bridgeMethod: env.BRIDGE_METHOD || "",
      bridgeArgs: parseJSON(env.BRIDGE_ARGS_JSON, [], "BRIDGE_ARGS_JSON"),
    },
    tokens: {
      weth: env.WETH_ADDRESS || DEFAULT_ADDRESSES.WETH_MAINNET,
    },
    avocado: {
      enabled: asBool(env.AVOCADO_ENABLED, true),
      rpcUrl: env.AVOCADO_RPC_URL || "https://rpc.avocado.instadapp.io",
      chainIds: parseJSON(
        env.AVOCADO_BALANCE_CHAINS_JSON,
        [1, 8453, 42161],
        "AVOCADO_BALANCE_CHAINS_JSON",
      ),
      trackTokenBalances: asBool(env.AVOCADO_TRACK_TOKENS, false),
      trackedTokensByChain: parseJSON(
        env.AVOCADO_TOKENS_BY_CHAIN_JSON,
        {},
        "AVOCADO_TOKENS_BY_CHAIN_JSON",
      ),
    },
    addresses: DEFAULT_ADDRESSES,
  };
}

module.exports = { loadConfig, DEFAULT_ADDRESSES };
