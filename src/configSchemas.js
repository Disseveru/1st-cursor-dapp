const { z } = require("zod");

const ethAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid Ethereum address");

const uniswapV3Source = z.object({
  quoter: ethAddress,
  fee: z.coerce.number().int().positive(),
  enabled: z.boolean().default(true),
});

const sushiswapSource = z.object({
  router: ethAddress,
  enabled: z.boolean().default(true),
});

const curveSource = z.object({
  pool: ethAddress,
  tokenInIndex: z.coerce.number().int().nonnegative(),
  tokenOutIndex: z.coerce.number().int().nonnegative(),
  enabled: z.boolean().default(true),
});

const arbitragePairSchema = z.object({
  label: z.string().min(1),
  chainId: z.coerce.number().int().positive(),
  tokenIn: ethAddress,
  tokenOut: ethAddress,
  tokenInDecimals: z.coerce.number().int().nonnegative().default(18),
  tokenOutDecimals: z.coerce.number().int().nonnegative().default(18),
  amountIn: z.string().min(1),
  minProfitBps: z.coerce.number().int().nonnegative().default(0),
  sources: z.object({
    uniswapV3: uniswapV3Source.optional(),
    sushiswap: sushiswapSource.optional(),
    curve: curveSource.optional(),
  }),
  nativeQuote: z
    .object({
      quoter: ethAddress,
      fee: z.coerce.number().int().positive().optional(),
    })
    .optional(),
});

const liquidationPositionSchema = z.object({
  label: z.string().optional(),
  protocol: z.enum(["aave-v3", "compound-v2", "compound-v3"]),
  chainId: z.coerce.number().int().positive().default(1),
  borrower: ethAddress,
  repayToken: ethAddress,
  collateralToken: ethAddress,
  flashLoanAmount: z.string().default("0"),
  flashLoanDecimals: z.coerce.number().int().nonnegative().default(18),
  expectedProfitEth: z.string().default("0"),
  poolAddress: ethAddress.optional(),
  comptrollerAddress: ethAddress.optional(),
  cometAddress: ethAddress.optional(),
  liquidationHealthFactor: z.coerce.number().positive().default(1),
});

const crossChainPairSchema = z.object({
  label: z.string().min(1),
  baseChainId: z.coerce.number().int().positive(),
  compareChainId: z.coerce.number().int().positive(),
  tokenInByChain: z.record(z.string(), ethAddress),
  tokenOutByChain: z.record(z.string(), ethAddress),
  tokenInDecimals: z.coerce.number().int().nonnegative().default(18),
  amountIn: z.string().default("0"),
  minSpreadBps: z.coerce.number().int().nonnegative().default(0),
  expectedProfitEth: z.string().optional(),
  source: z
    .object({
      name: z.enum(["uniswapV3", "sushiswap", "curve"]).default("uniswapV3"),
      quoter: ethAddress.optional(),
      quoterByChain: z.record(z.string(), ethAddress).optional(),
      fee: z.coerce.number().int().positive().optional(),
      router: ethAddress.optional(),
      routerByChain: z.record(z.string(), ethAddress).optional(),
      pool: ethAddress.optional(),
      poolByChain: z.record(z.string(), ethAddress).optional(),
      tokenInIndex: z.coerce.number().int().nonnegative().optional(),
      tokenOutIndex: z.coerce.number().int().nonnegative().optional(),
    })
    .optional(),
});

const spellStepSchema = z.object({
  connector: z.string().min(1),
  method: z.string().min(1),
  args: z.array(z.any()).default([]),
});

const executionTemplatesSchema = z.object({
  arbitrageInnerSteps: z.array(spellStepSchema).default([]),
  liquidationInnerSteps: z.array(spellStepSchema).default([]),
  crossChainInnerSteps: z.array(spellStepSchema).default([]),
});

function validateArbitragePairs(pairs, logger) {
  const results = [];
  for (const [i, pair] of pairs.entries()) {
    const parsed = arbitragePairSchema.safeParse(pair);
    if (parsed.success) {
      results.push(parsed.data);
    } else {
      logger.warn(
        { index: i, label: pair.label, errors: parsed.error.format() },
        "Invalid arbitrage pair config, skipping",
      );
    }
  }
  return results;
}

function validateLiquidationPositions(positions, logger) {
  const results = [];
  for (const [i, pos] of positions.entries()) {
    const parsed = liquidationPositionSchema.safeParse(pos);
    if (parsed.success) {
      results.push(parsed.data);
    } else {
      logger.warn(
        { index: i, label: pos.label, errors: parsed.error.format() },
        "Invalid liquidation position config, skipping",
      );
    }
  }
  return results;
}

function validateCrossChainPairs(pairs, logger) {
  const results = [];
  for (const [i, pair] of pairs.entries()) {
    const parsed = crossChainPairSchema.safeParse(pair);
    if (parsed.success) {
      results.push(parsed.data);
    } else {
      logger.warn(
        { index: i, label: pair.label, errors: parsed.error.format() },
        "Invalid cross-chain pair config, skipping",
      );
    }
  }
  return results;
}

function validateExecutionTemplates(templates, logger) {
  const parsed = executionTemplatesSchema.safeParse(templates);
  if (parsed.success) {
    return parsed.data;
  }
  logger.warn(
    { errors: parsed.error.format() },
    "Invalid execution templates config, using defaults",
  );
  return {
    arbitrageInnerSteps: [],
    liquidationInnerSteps: [],
    crossChainInnerSteps: [],
  };
}

module.exports = {
  arbitragePairSchema,
  liquidationPositionSchema,
  crossChainPairSchema,
  executionTemplatesSchema,
  spellStepSchema,
  validateArbitragePairs,
  validateLiquidationPositions,
  validateCrossChainPairs,
  validateExecutionTemplates,
};
