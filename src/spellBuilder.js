class SpellBuilder {
  constructor({ dsa, config, logger }) {
    this.dsa = dsa;
    this.config = config;
    this.logger = logger;
  }

  valueFromContext(value, context) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.valueFromContext(item, context));
    }
    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.valueFromContext(v, context)]),
      );
    }
    if (typeof value !== "string") return value;

    const exact = value.match(/^\{\{(.+)\}\}$/);
    if (exact) {
      return context[exact[1]] ?? value;
    }

    return value.replace(/\{\{(.+?)\}\}/g, (_, key) =>
      context[key] !== undefined ? String(context[key]) : `{{${key}}}`,
    );
  }

  normalizeArg(arg) {
    if (typeof arg === "bigint") return arg.toString();
    if (typeof arg === "number") return String(arg);
    return arg;
  }

  materializeSteps(templateSteps, context) {
    return templateSteps.map((step) => ({
      connector: this.valueFromContext(step.connector, context),
      method: this.valueFromContext(step.method, context),
      args: this.valueFromContext(step.args || [], context).map((arg) =>
        this.normalizeArg(arg),
      ),
    }));
  }

  buildSpellFromTemplate(templateSteps, context) {
    const spells = this.dsa.Spell();
    for (const step of this.materializeSteps(templateSteps, context)) {
      spells.add({
        connector: step.connector,
        method: step.method,
        args: step.args,
      });
    }
    return spells;
  }

  ensureFlashPayback(innerSpells, tokenAddress) {
    const hasPayback = innerSpells.data.some(
      (step) =>
        step.connector === "instapool_v2" && step.method === "flashPayback",
    );

    if (!hasPayback) {
      innerSpells.add({
        connector: "instapool_v2",
        method: "flashPayback",
        args: [tokenAddress, "0", "0", "0"],
      });
    }
  }

  buildContext(opportunity) {
    return {
      ...opportunity,
      tokenIn: opportunity.tokenIn || opportunity.repayToken,
      tokenOut: opportunity.tokenOut || opportunity.collateralToken,
      repayToken: opportunity.repayToken || opportunity.tokenIn,
      collateralToken: opportunity.collateralToken || opportunity.tokenOut,
      flashLoanAmountWei:
        opportunity.flashLoanAmountWei?.toString?.() ||
        String(opportunity.flashLoanAmountWei || "0"),
      borrower: opportunity.borrower,
      bridgeConnector: this.config.execution.bridgeConnector,
      bridgeMethod: this.config.execution.bridgeMethod,
      bridgeArgs: this.config.execution.bridgeArgs,
    };
  }

  templateForOpportunity(opportunityType) {
    if (opportunityType === "arbitrage") {
      return this.config.execution.templates.arbitrageInnerSteps || [];
    }
    if (opportunityType === "liquidation") {
      return this.config.execution.templates.liquidationInnerSteps || [];
    }
    if (opportunityType === "cross-chain") {
      return this.config.execution.templates.crossChainInnerSteps || [];
    }
    return [];
  }

  buildFlashloanSpell(opportunity) {
    const context = this.buildContext(opportunity);
    const templateSteps = this.templateForOpportunity(opportunity.type);
    if (!templateSteps.length) {
      throw new Error(
        `No execution template configured for opportunity type: ${opportunity.type}`,
      );
    }

    const innerSpells = this.buildSpellFromTemplate(templateSteps, context);
    this.ensureFlashPayback(innerSpells, context.repayToken);

    if (!innerSpells.data.length) {
      throw new Error(`No inner steps configured for ${opportunity.type}`);
    }

    const encodedData = this.dsa.instapool_v2.encodeFlashCastData(innerSpells);
    const outerSpells = this.dsa.Spell();
    outerSpells.add({
      connector: "instapool_v2",
      method: "flashBorrowAndCast",
      args: [
        context.repayToken,
        context.flashLoanAmountWei,
        String(this.config.execution.flashloanRoute),
        encodedData,
      ],
    });

    this.logger.debug(
      { type: opportunity.type, spellCount: innerSpells.data.length },
      "Built flashloan cast spell",
    );

    return outerSpells;
  }
}

module.exports = { SpellBuilder };
