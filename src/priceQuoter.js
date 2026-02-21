const { Contract } = require("ethers");
const { getProviderOrThrow } = require("./providers");
const { withRetry, isTransientRpcError } = require("./utils");

const UNIV3_QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) returns (uint256 amountOut)",
];
const SUSHI_ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
];
const CURVE_POOL_ABI = ["function get_dy(int128 i, int128 j, uint256 dx) view returns (uint256)"];

class PriceQuoter {
  constructor({ providers, logger, onRetry }) {
    this.providers = providers;
    this.logger = logger;
    this.onRetry = onRetry;
    this.contracts = new Map();
  }

  contractKey(chainId, address, name) {
    return `${chainId}:${address.toLowerCase()}:${name}`;
  }

  getContract(chainId, address, abi, name) {
    const key = this.contractKey(chainId, address, name);
    if (!this.contracts.has(key)) {
      const provider = getProviderOrThrow(this.providers, chainId);
      this.contracts.set(key, new Contract(address, abi, provider));
    }
    return this.contracts.get(key);
  }

  rpcRetryOpts(label) {
    return {
      maxAttempts: 3,
      baseDelayMs: 300,
      shouldRetry: isTransientRpcError,
      label,
      logger: this.logger,
      onRetry: this.onRetry,
    };
  }

  async quoteUniswapV3({ chainId, quoter, tokenIn, tokenOut, fee, amountInWei }) {
    const contract = this.getContract(chainId, quoter, UNIV3_QUOTER_ABI, "univ3quoter");
    return withRetry(
      () => contract.quoteExactInputSingle.staticCall(tokenIn, tokenOut, fee, amountInWei, 0),
      this.rpcRetryOpts(`uniV3-quote-${chainId}`),
    );
  }

  async quoteSushiV2({ chainId, router, tokenIn, tokenOut, amountInWei }) {
    const contract = this.getContract(chainId, router, SUSHI_ROUTER_ABI, "sushirouter");
    return withRetry(
      async () => {
        const amounts = await contract.getAmountsOut(amountInWei, [tokenIn, tokenOut]);
        return amounts[amounts.length - 1];
      },
      this.rpcRetryOpts(`sushi-quote-${chainId}`),
    );
  }

  async quoteCurve({ chainId, pool, tokenInIndex, tokenOutIndex, amountInWei }) {
    const contract = this.getContract(chainId, pool, CURVE_POOL_ABI, "curvepool");
    return withRetry(
      () => contract.get_dy(BigInt(tokenInIndex), BigInt(tokenOutIndex), amountInWei),
      this.rpcRetryOpts(`curve-quote-${chainId}`),
    );
  }

  async quoteBySource(sourceName, context) {
    if (sourceName === "uniswapV3") {
      return this.quoteUniswapV3({
        chainId: context.chainId,
        quoter: context.sources.uniswapV3.quoter,
        tokenIn: context.tokenIn,
        tokenOut: context.tokenOut,
        fee: context.sources.uniswapV3.fee ?? 500,
        amountInWei: context.amountInWei,
      });
    }

    if (sourceName === "sushiswap") {
      return this.quoteSushiV2({
        chainId: context.chainId,
        router: context.sources.sushiswap.router,
        tokenIn: context.tokenIn,
        tokenOut: context.tokenOut,
        amountInWei: context.amountInWei,
      });
    }

    if (sourceName === "curve") {
      return this.quoteCurve({
        chainId: context.chainId,
        pool: context.sources.curve.pool,
        tokenInIndex: context.sources.curve.tokenInIndex,
        tokenOutIndex: context.sources.curve.tokenOutIndex,
        amountInWei: context.amountInWei,
      });
    }

    throw new Error(`Unsupported source ${sourceName}`);
  }
}

module.exports = {
  PriceQuoter,
};
