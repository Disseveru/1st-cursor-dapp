const { parseUnits } = require("ethers");
const { addressEq } = require("./utils");

function enabledSources(sources = {}) {
  return Object.entries(sources)
    .filter(([, config]) => config && config.enabled !== false)
    .map(([name]) => name);
}

class ArbitrageMonitor {
  constructor({
    config,
    quoter,
    logger,
  }) {
    this.config = config;
    this.quoter = quoter;
    this.logger = logger;
  }

  withReverseContext(context) {
    const curve = context.sources.curve
      ? {
          ...context.sources.curve,
          tokenInIndex: context.sources.curve.tokenOutIndex,
          tokenOutIndex: context.sources.curve.tokenInIndex,
        }
      : undefined;

    return {
      ...context,
      tokenIn: context.tokenOut,
      tokenOut: context.tokenIn,
      sources: {
        ...context.sources,
        curve,
      },
    };
  }

  async quoteSafe(source, context) {
    try {
      return await this.quoter.quoteBySource(source, context);
    } catch (error) {
      this.logger.debug(
        {
          pair: context.label,
          source,
          error: error.message,
        },
        "Quote failed for source",
      );
      return null;
    }
  }

  async convertProfitToEth(pair, profitWei) {
    if (profitWei <= 0n) return 0n;
    if (addressEq(pair.tokenIn, this.config.tokens.weth)) return profitWei;

    const nativeQuote = pair.nativeQuote;
    if (!nativeQuote || !nativeQuote.quoter) {
      return 0n;
    }

    try {
      const amount = await this.quoter.quoteUniswapV3({
        chainId: pair.chainId,
        quoter: nativeQuote.quoter,
        tokenIn: pair.tokenIn,
        tokenOut: this.config.tokens.weth,
        fee: nativeQuote.fee ?? 500,
        amountInWei: profitWei,
      });
      return amount;
    } catch (error) {
      this.logger.debug(
        { pair: pair.label, error: error.message },
        "Unable to convert profit token to ETH",
      );
      return 0n;
    }
  }

  async scanPair(pair) {
    const amountInWei = parseUnits(String(pair.amountIn), pair.tokenInDecimals);
    const context = {
      ...pair,
      amountInWei,
    };

    const sources = enabledSources(pair.sources);
    if (sources.length < 2) {
      return null;
    }

    const forwardQuoteResults = await Promise.all(
      sources.map(async (source) => {
        const out = await this.quoteSafe(source, context);
        return [source, out];
      }),
    );
    const forwardQuotes = Object.fromEntries(
      forwardQuoteResults.filter(([, out]) => out !== null && out > 0n),
    );

    const forwardEntries = Object.entries(forwardQuotes);
    if (forwardEntries.length < 2) {
      return null;
    }

    const reverseRoutes = await Promise.all(
      forwardEntries.flatMap(([buySource, buyOutWei]) =>
        sources
          .filter((sellSource) => sellSource !== buySource)
          .map(async (sellSource) => {
            const reverseContext = this.withReverseContext({
              ...context,
              amountInWei: buyOutWei,
            });
            const finalOut = await this.quoteSafe(sellSource, reverseContext);
            if (!finalOut || finalOut <= 0n) {
              return null;
            }
            return {
              buySource,
              sellSource,
              buyOutWei,
              finalOutWei: finalOut,
              profitWei: finalOut - amountInWei,
            };
          }),
      ),
    );
    const validRoutes = reverseRoutes.filter(Boolean);
    let bestRoute = null;
    for (const route of validRoutes) {
      if (!bestRoute || route.profitWei > bestRoute.profitWei) {
        bestRoute = route;
      }
    }

    if (!bestRoute || bestRoute.profitWei <= 0n) return null;

    const profitBps = Number((bestRoute.profitWei * 10_000n) / amountInWei);
    const minProfitBps = Number(pair.minProfitBps ?? 0);
    if (profitBps < minProfitBps) {
      return null;
    }

    const expectedProfitEthWei = await this.convertProfitToEth(
      pair,
      bestRoute.profitWei,
    );

    return {
      type: "arbitrage",
      label: pair.label,
      chainId: pair.chainId,
      tokenIn: pair.tokenIn,
      tokenOut: pair.tokenOut,
      flashLoanAmountWei: amountInWei,
      expectedProfitTokenWei: bestRoute.profitWei,
      expectedProfitEthWei,
      profitBps,
      route: bestRoute,
    };
  }

  async scan() {
    const opportunities = [];
    for (const pair of this.config.monitoring.arbitragePairs) {
      const result = await this.scanPair(pair);
      if (result) {
        this.logger.info(
          {
            pair: result.label,
            chainId: result.chainId,
            route: `${result.route.buySource}->${result.route.sellSource}`,
            profitBps: result.profitBps,
          },
          "Arbitrage opportunity detected",
        );
        opportunities.push(result);
      }
    }
    return opportunities;
  }
}

module.exports = { ArbitrageMonitor };
