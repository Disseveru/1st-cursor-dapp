import { ethers } from 'ethers';
import { CONNECTORS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Maps DEX names to their corresponding Instadapp connector identifiers.
 */
const DEX_TO_CONNECTOR = {
  uniswap_v3: CONNECTORS.UNISWAP_V3,
  sushiswap: CONNECTORS.UNISWAP_V3, // Instadapp routes SushiSwap via the same swap interface
  curve: CONNECTORS.BASIC,
};

/**
 * Builds a flash-loan-backed arbitrage spell sequence:
 *   1. Flash borrow `amountIn` of `tokenIn` via INSTAPOOL
 *   2. Swap on the cheap DEX (buy leg)
 *   3. Swap back on the expensive DEX (sell leg)
 *   4. Repay flash loan
 *
 * @param {object} dsa - The initialised DSA SDK instance
 * @param {import('../monitors/swapArbitrage.js').ArbitrageOpportunity} opp
 * @returns {object} spell - ready to `.cast()`
 */
export function buildArbitrageSpell(dsa, opp) {
  const spell = dsa.Spell();

  const flashToken = opp.tokenIn;
  const flashAmount = opp.amountIn;
  const setIdBorrow = 1;
  const setIdSell = 2;

  // 1 — Flash borrow
  spell.add({
    connector: CONNECTORS.INSTAPOOL_V5,
    method: 'flashBorrowAndCast',
    args: [
      flashToken,
      flashAmount.toString(),
      0, // route (0 = best available)
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string[]', 'bytes[]'],
        [
          [
            DEX_TO_CONNECTOR[opp.buyDex] || CONNECTORS.UNISWAP_V3,
            DEX_TO_CONNECTOR[opp.sellDex] || CONNECTORS.UNISWAP_V3,
            CONNECTORS.INSTAPOOL_V5,
          ],
          [
            buildSwapData(opp.tokenIn, opp.tokenOut, flashAmount, setIdBorrow),
            buildSwapData(opp.tokenOut, opp.tokenIn, 0n, setIdSell), // 0 = use full balance
            buildFlashRepayData(flashToken, flashAmount),
          ],
        ],
      ),
      0, // setId
    ],
  });

  logger.debug(
    `[SpellBuilder] Arbitrage spell: flash ${ethers.formatEther(flashAmount)} ${flashToken.slice(0, 8)} | buy@${opp.buyDex} sell@${opp.sellDex}`,
  );

  return spell;
}

/**
 * Builds a flash-loan-backed liquidation spell:
 *   1. Flash borrow the debt token amount needed for liquidation
 *   2. Call the protocol's liquidation method
 *   3. Swap seized collateral to repay flash loan
 *   4. Repay flash loan
 *
 * @param {object} dsa - The initialised DSA SDK instance
 * @param {import('../monitors/liquidation.js').LiquidationTarget} target
 * @param {object} opts
 * @param {string} opts.debtToken - Address of the debt asset to repay
 * @param {string} opts.collateralToken - Address of the collateral to seize
 * @param {bigint} opts.debtToCover - Amount of debt to repay
 */
export function buildLiquidationSpell(dsa, target, opts) {
  const spell = dsa.Spell();
  const { debtToken, collateralToken, debtToCover } = opts;

  if (target.protocol === 'aave_v3') {
    // Flash borrow debtToken
    spell.add({
      connector: CONNECTORS.INSTAPOOL_V5,
      method: 'flashBorrowAndCast',
      args: [
        debtToken,
        debtToCover.toString(),
        0,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['string[]', 'bytes[]'],
          [
            [CONNECTORS.AAVE_V3, CONNECTORS.UNISWAP_V3, CONNECTORS.INSTAPOOL_V5],
            [
              buildAaveLiquidateData(collateralToken, debtToken, target.account, debtToCover),
              buildSwapData(collateralToken, debtToken, 0n, 1),
              buildFlashRepayData(debtToken, debtToCover),
            ],
          ],
        ),
        0,
      ],
    });
  } else if (target.protocol === 'compound_v3') {
    spell.add({
      connector: CONNECTORS.COMPOUND_V3,
      method: 'liquidate',
      args: [
        target.account,
        collateralToken,
        debtToCover.toString(),
        0,
        0,
      ],
    });
  }

  logger.debug(
    `[SpellBuilder] Liquidation spell: ${target.protocol} account=${target.account.slice(0, 10)} debtToCover=${debtToCover}`,
  );

  return spell;
}

// ---- Internal helpers to encode sub-spell data ----

function buildSwapData(tokenIn, tokenOut, amountIn, setId) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
    [tokenIn, tokenOut, amountIn ?? 0n, 0, setId, 0],
  );
}

function buildFlashRepayData(token, amount) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256', 'uint256', 'uint256'],
    [token, amount, 0, 0],
  );
}

function buildAaveLiquidateData(collateral, debt, user, amount) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'address', 'uint256', 'uint256', 'uint256'],
    [collateral, debt, user, amount, 0, 0],
  );
}
