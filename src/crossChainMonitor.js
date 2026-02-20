const { parseUnits } = require("ethers");
const { addressEq } = require("./utils");

class CrossChainMonitor {
  constructor({ config, quoter, avocadoBalanceFetcher, logger }) {
    this.config = config;
    this.quoter = quoter;
    this.avocadoBalanceFetcher = avocadoBalanceFetcher;
    this.logger = logger;
  }

  sourceContextForChain(pair, chainId, amountInWei) {
    const source = pair.source || {};
    const name = source.name || "uniswapV3";

    if (name === "uniswapV3") {
      const quoter = source.quoterByChain?.[String(chainId)] || source.quoter;
      return {
        chainId,
        tokenIn: pair.tokenInByChain[String(chainId)],
        tokenOut: pair.tokenOutByChain[String(chainId)],
        amountInWei,
        sources: {
          uniswapV3: { quoter, fee: source.fee ?? 500, enabled: true },
        },
      };
    }

    if (name === "sushiswap") {
      const router = source.routerByChain?.[String(chainId)] || source.router;
      return {
        chainId,
        tokenIn: pair.tokenInByChain[String(chainId)],
        tokenOut: pair.tokenOutByChain[String(chainId)],
        amountInWei,
        sources: {
          sushiswap: { router, enabled: true },
        },
      };
    }

    if (name === "curve") {
      const pool = source.poolByChain?.[String(chainId)] || source.pool;
      return {
        chainId,
        tokenIn: pair.tokenInByChain[String(chainId)],
        tokenOut: pair.tokenOutByChain[String(chainId)],
        amountInWei,
        sources: {
          curve: {
            pool,
            tokenInIndex: source.tokenInIndex,
            tokenOutIndex: source.tokenOutIndex,
            enabled: true,
          },
        },
      };
    }

    throw new Error(`Unsupported cross-chain source ${name}`);
  }

  async scanPair(pair, balances) {
    const amountInWei = parseUnits(
      String(pair.amountIn || "0"),
      Number(pair.tokenInDecimals || 18),
    );

    const baseChainId = Number(pair.baseChainId);
    const compareChainId = Number(pair.compareChainId);

    if (
      !pair.tokenInByChain?.[String(baseChainId)] ||
      !pair.tokenInByChain?.[String(compareChainId)] ||
      !pair.tokenOutByChain?.[String(baseChainId)] ||
      !pair.tokenOutByChain?.[String(compareChainId)]
    ) {
      return null;
    }

    try {
      const baseContext = this.sourceContextForChain(pair, baseChainId, amountInWei);
      const compareContext = this.sourceContextForChain(pair, compareChainId, amountInWei);
      const sourceName = pair.source?.name || "uniswapV3";

      const [baseQuote, compareQuote] = await Promise.all([
        this.quoter.quoteBySource(sourceName, baseContext),
        this.quoter.quoteBySource(sourceName, compareContext),
      ]);

      const maxOut = baseQuote > compareQuote ? baseQuote : compareQuote;
      const minOut = baseQuote > compareQuote ? compareQuote : baseQuote;
      if (minOut <= 0n) return null;

      const spreadWei = maxOut - minOut;
      const spreadBps = Number((spreadWei * 10_000n) / minOut);
      const minSpreadBps = Number(pair.minSpreadBps || 0);

      if (spreadBps < minSpreadBps) {
        return null;
      }

      let expectedProfitEthWei = 0n;
      if (
        pair.tokenOutByChain?.[String(baseChainId)] &&
        addressEq(pair.tokenOutByChain[String(baseChainId)], this.config.tokens.weth)
      ) {
        expectedProfitEthWei = spreadWei;
      } else if (pair.expectedProfitEth) {
        expectedProfitEthWei = parseUnits(String(pair.expectedProfitEth), 18);
      }

      return {
        type: "cross-chain",
        label: pair.label,
        chainId: baseChainId,
        baseChainId,
        compareChainId,
        tokenIn: pair.tokenInByChain[String(baseChainId)],
        tokenOut: pair.tokenOutByChain[String(baseChainId)],
        flashLoanAmountWei: amountInWei,
        expectedProfitEthWei,
        metadata: {
          source: sourceName,
          baseQuote: baseQuote.toString(),
          compareQuote: compareQuote.toString(),
          spreadBps,
          balances,
        },
      };
    } catch (error) {
      this.logger.debug(
        { label: pair.label, error: error.message },
        "Cross-chain quote scan failed",
      );
      return null;
    }
  }

  async scan() {
    const pairs = this.config.monitoring.crossChainPairs || [];
    if (!pairs.length) return [];

    const balances = this.avocadoBalanceFetcher
      ? await this.avocadoBalanceFetcher.fetchBalances()
      : null;

    const opportunities = [];
    for (const pair of pairs) {
      const opp = await this.scanPair(pair, balances);
      if (opp) {
        this.logger.info(
          {
            label: opp.label,
            baseChainId: opp.baseChainId,
            compareChainId: opp.compareChainId,
            spreadBps: opp.metadata.spreadBps,
          },
          "Cross-chain spread detected",
        );
        opportunities.push(opp);
      }
    }

    return opportunities;
  }
}

module.exports = { CrossChainMonitor };
