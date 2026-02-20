import { ethers } from 'ethers';
import { getMainnetProvider, getArbitrumProvider, getBaseProvider } from '../connection/provider.js';
import { TOKENS } from '../config/addresses.js';
import { ERC20_ABI } from '../config/abis.js';
import logger from '../utils/logger.js';
import { retry } from '../utils/helpers.js';

/**
 * Chainlink-style price feed ABI (also works for many protocol oracles).
 */
const PRICE_FEED_ABI = [
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
];

/**
 * Well-known Chainlink ETH/USD price feed addresses per chain.
 */
const ETH_USD_FEEDS = {
  mainnet: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  arbitrum: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
  base: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
};

/**
 * Fetch the latest ETH/USD price from a Chainlink feed on the given provider.
 */
async function getEthUsdPrice(provider, feedAddress) {
  const feed = new ethers.Contract(feedAddress, PRICE_FEED_ABI, provider);
  const data = await retry(() => feed.latestRoundData());
  const answer = data.answer ?? data[1];
  return Number(ethers.formatUnits(answer, 8));
}

/**
 * Compare ETH/USD prices across mainnet, Arbitrum, and Base.
 * Returns opportunities where the price gap exceeds a threshold.
 */
export async function scanCrossChainPriceGaps(thresholdBps = 20) {
  const mainnetProvider = getMainnetProvider();
  const arbProvider = getArbitrumProvider();
  const baseProvider = getBaseProvider();

  const prices = {};

  try {
    prices.mainnet = await getEthUsdPrice(mainnetProvider, ETH_USD_FEEDS.mainnet);
  } catch (err) {
    logger.warn(`Failed to get mainnet ETH/USD price: ${err.message}`);
    return [];
  }

  if (arbProvider) {
    try {
      prices.arbitrum = await getEthUsdPrice(arbProvider, ETH_USD_FEEDS.arbitrum);
    } catch (err) {
      logger.warn(`Failed to get Arbitrum ETH/USD price: ${err.message}`);
    }
  }

  if (baseProvider) {
    try {
      prices.base = await getEthUsdPrice(baseProvider, ETH_USD_FEEDS.base);
    } catch (err) {
      logger.warn(`Failed to get Base ETH/USD price: ${err.message}`);
    }
  }

  const chains = Object.keys(prices);
  if (chains.length < 2) {
    logger.debug('Cross-chain scanner: not enough chains with price data');
    return [];
  }

  const opportunities = [];

  for (let i = 0; i < chains.length; i++) {
    for (let j = i + 1; j < chains.length; j++) {
      const chainA = chains[i];
      const chainB = chains[j];
      const pA = prices[chainA];
      const pB = prices[chainB];
      const mid = (pA + pB) / 2;
      const diffBps = Math.abs(pA - pB) / mid * 10000;

      if (diffBps >= thresholdBps) {
        const buySide = pA < pB ? chainA : chainB;
        const sellSide = pA < pB ? chainB : chainA;
        const opp = {
          token: 'ETH',
          buySide,
          sellSide,
          buyPrice: prices[buySide],
          sellPrice: prices[sellSide],
          spreadBps: Math.round(diffBps),
        };
        logger.info(
          `Cross-chain gap: ETH buy@${buySide}($${opp.buyPrice}) sell@${sellSide}($${opp.sellPrice}) spread=${opp.spreadBps}bps`,
        );
        opportunities.push(opp);
      }
    }
  }

  return opportunities;
}

/**
 * Fetch ERC-20 token balances for an address across all configured chains
 * (mirrors Avocado's cross-chain balance fetching concept).
 */
export async function fetchCrossChainBalances(address, tokenAddress = TOKENS.WETH) {
  const balances = {};
  const providers = {
    mainnet: getMainnetProvider(),
    arbitrum: getArbitrumProvider(),
    base: getBaseProvider(),
  };

  for (const [chain, provider] of Object.entries(providers)) {
    if (!provider) continue;
    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const bal = await token.balanceOf(address);
      balances[chain] = ethers.formatEther(bal);
    } catch {
      balances[chain] = '0';
    }
  }

  return balances;
}
