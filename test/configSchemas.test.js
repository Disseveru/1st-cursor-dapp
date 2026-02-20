const {
  arbitragePairSchema,
  liquidationPositionSchema,
  crossChainPairSchema,
  executionTemplatesSchema,
  validateArbitragePairs,
  validateLiquidationPositions,
  validateCrossChainPairs,
  validateExecutionTemplates,
} = require("../src/configSchemas");

const VALID_ADDR = "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2";
const VALID_ADDR2 = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

const nullLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe("arbitragePairSchema", () => {
  const validPair = {
    label: "DAI/USDC",
    chainId: 1,
    tokenIn: VALID_ADDR,
    tokenOut: VALID_ADDR2,
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    amountIn: "25000",
    minProfitBps: 5,
    sources: {
      uniswapV3: { quoter: VALID_ADDR, fee: 500, enabled: true },
    },
  };

  it("accepts a valid arbitrage pair", () => {
    expect(arbitragePairSchema.safeParse(validPair).success).toBe(true);
  });

  it("rejects missing label", () => {
    const { label: _label, ...rest } = validPair;
    expect(arbitragePairSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid token address", () => {
    expect(arbitragePairSchema.safeParse({ ...validPair, tokenIn: "not-an-address" }).success).toBe(
      false,
    );
  });

  it("provides defaults for decimals", () => {
    const { tokenInDecimals: _tid, tokenOutDecimals: _tod, ...rest } = validPair;
    const result = arbitragePairSchema.parse(rest);
    expect(result.tokenInDecimals).toBe(18);
    expect(result.tokenOutDecimals).toBe(18);
  });
});

describe("liquidationPositionSchema", () => {
  const validPos = {
    protocol: "aave-v3",
    borrower: VALID_ADDR,
    repayToken: VALID_ADDR,
    collateralToken: VALID_ADDR2,
  };

  it("accepts a valid liquidation position", () => {
    expect(liquidationPositionSchema.safeParse(validPos).success).toBe(true);
  });

  it("rejects unsupported protocol", () => {
    expect(liquidationPositionSchema.safeParse({ ...validPos, protocol: "maker" }).success).toBe(
      false,
    );
  });

  it("defaults chainId to 1", () => {
    const result = liquidationPositionSchema.parse(validPos);
    expect(result.chainId).toBe(1);
  });
});

describe("crossChainPairSchema", () => {
  const validPair = {
    label: "ETH/USDC spread",
    baseChainId: 1,
    compareChainId: 42161,
    tokenInByChain: { 1: VALID_ADDR, 42161: VALID_ADDR },
    tokenOutByChain: { 1: VALID_ADDR2, 42161: VALID_ADDR2 },
  };

  it("accepts a valid cross-chain pair", () => {
    expect(crossChainPairSchema.safeParse(validPair).success).toBe(true);
  });

  it("rejects missing baseChainId", () => {
    const { baseChainId: _bci, ...rest } = validPair;
    expect(crossChainPairSchema.safeParse(rest).success).toBe(false);
  });
});

describe("executionTemplatesSchema", () => {
  it("accepts valid templates", () => {
    const valid = {
      arbitrageInnerSteps: [{ connector: "oneInch", method: "sell", args: ["a", "b"] }],
      liquidationInnerSteps: [],
      crossChainInnerSteps: [],
    };
    expect(executionTemplatesSchema.safeParse(valid).success).toBe(true);
  });

  it("provides empty arrays as defaults", () => {
    const result = executionTemplatesSchema.parse({});
    expect(result.arbitrageInnerSteps).toEqual([]);
    expect(result.liquidationInnerSteps).toEqual([]);
    expect(result.crossChainInnerSteps).toEqual([]);
  });
});

describe("validateArbitragePairs", () => {
  it("filters out invalid pairs and logs warnings", () => {
    const pairs = [
      {
        label: "valid",
        chainId: 1,
        tokenIn: VALID_ADDR,
        tokenOut: VALID_ADDR2,
        amountIn: "100",
        sources: {},
      },
      { label: "invalid", chainId: -1, tokenIn: "bad" },
    ];
    const result = validateArbitragePairs(pairs, nullLogger);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("valid");
    expect(nullLogger.warn).toHaveBeenCalled();
  });
});

describe("validateLiquidationPositions", () => {
  it("filters out invalid positions", () => {
    const positions = [
      {
        protocol: "aave-v3",
        borrower: VALID_ADDR,
        repayToken: VALID_ADDR,
        collateralToken: VALID_ADDR2,
      },
      { protocol: "bad" },
    ];
    const result = validateLiquidationPositions(positions, nullLogger);
    expect(result).toHaveLength(1);
  });
});

describe("validateCrossChainPairs", () => {
  it("returns empty array for empty input", () => {
    expect(validateCrossChainPairs([], nullLogger)).toEqual([]);
  });
});

describe("validateExecutionTemplates", () => {
  it("returns defaults for invalid input", () => {
    const result = validateExecutionTemplates("not-an-object", nullLogger);
    expect(result.arbitrageInnerSteps).toEqual([]);
  });
});
