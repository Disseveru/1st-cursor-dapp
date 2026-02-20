const test = require("node:test");
const assert = require("node:assert/strict");

const { SpellBuilder } = require("../src/spellBuilder");

function createMockDsa() {
  const state = {
    encodedInnerSpells: null,
  };

  const dsa = {
    Spell() {
      return {
        data: [],
        add(step) {
          this.data.push(step);
        },
      };
    },
    instapool_v2: {
      encodeFlashCastData(spells) {
        state.encodedInnerSpells = spells.data.map((step) => ({
          ...step,
          args: [...step.args],
        }));
        return "0xencoded";
      },
    },
  };

  return { dsa, state };
}

function createBuilder(templates) {
  const { dsa, state } = createMockDsa();
  const config = {
    execution: {
      flashloanRoute: 0,
      bridgeConnector: "",
      bridgeMethod: "",
      bridgeArgs: [],
      templates,
    },
  };
  const logger = { debug() {} };
  return {
    builder: new SpellBuilder({ dsa, config, logger }),
    state,
  };
}

test("uses protocol-specific liquidation template when configured", () => {
  const templates = {
    liquidationInnerStepsByProtocol: {
      "compound-v2": [
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
          connector: "instapool_v2",
          method: "flashPayback",
          args: ["{{repayToken}}", "0", "9001", "0"],
        },
      ],
    },
  };

  const { builder, state } = createBuilder(templates);

  const outerSpell = builder.buildFlashloanSpell({
    type: "liquidation",
    protocol: "compound-v2",
    borrower: "0xBorrower",
    repayToken: "0xRepay",
    collateralToken: "0xCollateral",
    flashLoanAmountWei: 123n,
  });

  assert.equal(state.encodedInnerSpells.length, 2);
  assert.equal(state.encodedInnerSpells[0].connector, "compound");
  assert.equal(state.encodedInnerSpells[0].method, "liquidate");
  assert.deepEqual(state.encodedInnerSpells[0].args, [
    "0xBorrower",
    "0xRepay",
    "0xCollateral",
    "123",
    "0",
    "9001",
  ]);

  assert.equal(outerSpell.data.length, 1);
  assert.equal(outerSpell.data[0].connector, "instapool_v2");
  assert.equal(outerSpell.data[0].method, "flashBorrowAndCast");
  assert.deepEqual(outerSpell.data[0].args, ["0xRepay", "123", "0", "0xencoded"]);
});

test("throws for unsupported liquidation protocol when protocol map is present", () => {
  const templates = {
    liquidationInnerStepsByProtocol: {
      "compound-v2": [
        {
          connector: "compound",
          method: "liquidate",
          args: ["{{borrower}}", "{{repayToken}}", "{{collateralToken}}", "1", "0", "0"],
        },
      ],
    },
  };

  const { builder } = createBuilder(templates);

  assert.throws(
    () =>
      builder.buildFlashloanSpell({
        type: "liquidation",
        protocol: "aave-v3",
        borrower: "0xBorrower",
        repayToken: "0xRepay",
        collateralToken: "0xCollateral",
        flashLoanAmountWei: 1n,
      }),
    /No execution template configured for liquidation protocol: aave-v3/,
  );
});

test("falls back to shared liquidation template when no protocol map exists", () => {
  const templates = {
    liquidationInnerSteps: [
      {
        connector: "oneInch",
        method: "sell",
        args: ["{{collateralToken}}", "{{repayToken}}", "0", "0", "9001", "9002"],
      },
      {
        connector: "instapool_v2",
        method: "flashPayback",
        args: ["{{repayToken}}", "0", "9002", "0"],
      },
    ],
  };

  const { builder, state } = createBuilder(templates);

  builder.buildFlashloanSpell({
    type: "liquidation",
    protocol: "aave-v3",
    repayToken: "0xRepay",
    collateralToken: "0xCollateral",
    flashLoanAmountWei: 77n,
  });

  assert.equal(state.encodedInnerSpells[0].connector, "oneInch");
  assert.deepEqual(state.encodedInnerSpells[0].args, [
    "0xCollateral",
    "0xRepay",
    "0",
    "0",
    "9001",
    "9002",
  ]);
});

test("auto-adds flashPayback when template omits payback step", () => {
  const templates = {
    arbitrageInnerSteps: [
      {
        connector: "oneInch",
        method: "sell",
        args: ["{{tokenIn}}", "{{tokenOut}}", "{{flashLoanAmountWei}}", "0", "0", "9001"],
      },
    ],
  };

  const { builder, state } = createBuilder(templates);

  builder.buildFlashloanSpell({
    type: "arbitrage",
    tokenIn: "0xTokenIn",
    tokenOut: "0xTokenOut",
    flashLoanAmountWei: 555n,
  });

  assert.equal(state.encodedInnerSpells.length, 2);
  const payback = state.encodedInnerSpells[1];
  assert.equal(payback.connector, "instapool_v2");
  assert.equal(payback.method, "flashPayback");
  assert.deepEqual(payback.args, ["0xTokenIn", "0", "0", "0"]);
});
