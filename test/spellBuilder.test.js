const { SpellBuilder } = require("../src/spellBuilder");

function makeMockDsa() {
  const spellData = { data: [] };
  return {
    Spell: () => ({
      data: spellData.data,
      add: (step) => spellData.data.push(step),
    }),
    instapool_v2: {
      encodeFlashCastData: jest.fn(() => "0xencodeddata"),
    },
  };
}

function makeConfig(overrides = {}) {
  return {
    execution: {
      flashloanRoute: 0,
      bridgeConnector: "",
      bridgeMethod: "",
      bridgeArgs: [],
      templates: {
        arbitrageInnerSteps: [
          {
            connector: "oneInch",
            method: "sell",
            args: ["{{tokenOut}}", "{{tokenIn}}", "{{flashLoanAmountWei}}", "0", "0", "9001"],
          },
          {
            connector: "oneInch",
            method: "sell",
            args: ["{{tokenIn}}", "{{tokenOut}}", "0", "0", "9001", "9002"],
          },
          {
            connector: "instapool_v2",
            method: "flashPayback",
            args: ["{{tokenIn}}", "0", "9002", "0"],
          },
        ],
        liquidationInnerSteps: [
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
        ],
        crossChainInnerSteps: [],
      },
      ...overrides,
    },
  };
}

const nullLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe("SpellBuilder", () => {
  describe("valueFromContext", () => {
    let builder;

    beforeEach(() => {
      builder = new SpellBuilder({
        dsa: makeMockDsa(),
        config: makeConfig(),
        logger: nullLogger,
      });
    });

    it("replaces exact {{placeholder}} with context value", () => {
      expect(builder.valueFromContext("{{foo}}", { foo: "bar" })).toBe("bar");
    });

    it("leaves unresolved placeholders intact", () => {
      expect(builder.valueFromContext("{{missing}}", {})).toBe("{{missing}}");
    });

    it("handles embedded placeholders in longer string", () => {
      expect(builder.valueFromContext("prefix-{{x}}-suffix", { x: "42" })).toBe("prefix-42-suffix");
    });

    it("recursively resolves arrays", () => {
      const result = builder.valueFromContext(["{{a}}", "{{b}}"], {
        a: "1",
        b: "2",
      });
      expect(result).toEqual(["1", "2"]);
    });

    it("recursively resolves objects", () => {
      const result = builder.valueFromContext({ key: "{{v}}" }, { v: "val" });
      expect(result).toEqual({ key: "val" });
    });

    it("returns non-string primitives as-is", () => {
      expect(builder.valueFromContext(42, {})).toBe(42);
      expect(builder.valueFromContext(null, {})).toBe(null);
    });
  });

  describe("normalizeArg", () => {
    let builder;

    beforeEach(() => {
      builder = new SpellBuilder({
        dsa: makeMockDsa(),
        config: makeConfig(),
        logger: nullLogger,
      });
    });

    it("converts bigint to string", () => {
      expect(builder.normalizeArg(123n)).toBe("123");
    });

    it("converts number to string", () => {
      expect(builder.normalizeArg(42)).toBe("42");
    });

    it("passes strings through", () => {
      expect(builder.normalizeArg("hello")).toBe("hello");
    });
  });

  describe("buildContext", () => {
    let builder;

    beforeEach(() => {
      builder = new SpellBuilder({
        dsa: makeMockDsa(),
        config: makeConfig(),
        logger: nullLogger,
      });
    });

    it("maps tokenIn/tokenOut aliases for liquidation opportunities", () => {
      const ctx = builder.buildContext({
        type: "liquidation",
        repayToken: "0xRepay",
        collateralToken: "0xCollateral",
        flashLoanAmountWei: 1000n,
        borrower: "0xBorrower",
      });
      expect(ctx.tokenIn).toBe("0xRepay");
      expect(ctx.tokenOut).toBe("0xCollateral");
      expect(ctx.flashLoanAmountWei).toBe("1000");
    });
  });

  describe("templateForOpportunity", () => {
    let builder;

    beforeEach(() => {
      builder = new SpellBuilder({
        dsa: makeMockDsa(),
        config: makeConfig(),
        logger: nullLogger,
      });
    });

    it("returns arbitrage template for arbitrage type", () => {
      const t = builder.templateForOpportunity("arbitrage");
      expect(t).toHaveLength(3);
      expect(t[0].connector).toBe("oneInch");
    });

    it("returns liquidation template for liquidation type", () => {
      const t = builder.templateForOpportunity("liquidation");
      expect(t).toHaveLength(1);
      expect(t[0].method).toBe("liquidate");
    });

    it("returns empty array for unknown type", () => {
      expect(builder.templateForOpportunity("unknown")).toEqual([]);
    });
  });

  describe("buildFlashloanSpell", () => {
    it("throws when no template is configured for opportunity type", () => {
      const builder = new SpellBuilder({
        dsa: makeMockDsa(),
        config: makeConfig(),
        logger: nullLogger,
      });

      expect(() => builder.buildFlashloanSpell({ type: "unknown" })).toThrow(
        "No execution template configured for opportunity type: unknown",
      );
    });
  });
});
