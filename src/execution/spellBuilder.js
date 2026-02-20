import { ethers } from 'ethers';
import { INSTADAPP } from '../config/addresses.js';
import logger from '../utils/logger.js';

/**
 * Encode a single connector call as ABI-packed bytes.
 * The InstaAccount.cast() function expects (string[] targets, bytes[] datas).
 * Each `data` entry is the ABI-encoded function call for that connector.
 */

const FLASHLOAN_IFACE = new ethers.Interface([
  'function flashBorrowAndCast(address token, uint256 amt, uint256 route, bytes data)',
]);

const UNISWAP_SWAP_IFACE = new ethers.Interface([
  'function sell(address buyAddr, address sellAddr, uint256 amt, uint256 unitAmt, uint24 fee, uint256 getId, uint256 setId)',
]);

const AAVE_LIQUIDATE_IFACE = new ethers.Interface([
  'function liquidate(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken, uint256 getId, uint256 setId)',
]);

const BASIC_WITHDRAW_IFACE = new ethers.Interface([
  'function withdraw(address token, uint256 amt, address to, uint256 getId, uint256 setId)',
]);

/**
 * Build a spell sequence for a DEX arbitrage via flash loan.
 *
 * Flow:
 *   1. Flash-borrow tokenA
 *   2. Swap tokenA -> tokenB on the cheaper DEX (buy side)
 *   3. Swap tokenB -> tokenA on the more expensive DEX (sell side)
 *   4. Flash-loan is auto-repaid from the DSA balance
 *   5. Withdraw remaining profit to the wallet
 */
export function buildArbitrageSpell({ tokenA, tokenB, amountIn, buyDex, sellDex, walletAddress }) {
  const targets = [];
  const datas = [];

  const buyFee = dexToUniFee(buyDex);
  const sellFee = dexToUniFee(sellDex);

  const innerTargets = [
    INSTADAPP.uniswapConnector,
    INSTADAPP.uniswapConnector,
    INSTADAPP.basicConnector,
  ];

  const innerDatas = [
    UNISWAP_SWAP_IFACE.encodeFunctionData('sell', [
      tokenB,       // buyAddr
      tokenA,       // sellAddr
      amountIn,     // amt (flash-loaned amount)
      0,            // unitAmt — 0 means no slippage guard (trust the simulation)
      buyFee,
      0, 0,
    ]),
    UNISWAP_SWAP_IFACE.encodeFunctionData('sell', [
      tokenA,       // buyAddr
      tokenB,       // sellAddr
      ethers.MaxUint256, // amt — swap entire received balance
      0,
      sellFee,
      0, 0,
    ]),
    BASIC_WITHDRAW_IFACE.encodeFunctionData('withdraw', [
      tokenA,
      ethers.MaxUint256,
      walletAddress,
      0, 0,
    ]),
  ];

  const innerSpellData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['string[]', 'bytes[]'],
    [innerTargets, innerDatas],
  );

  targets.push(INSTADAPP.flashloanConnector);
  datas.push(
    FLASHLOAN_IFACE.encodeFunctionData('flashBorrowAndCast', [
      tokenA,
      amountIn,
      5,  // route 5 = Instadapp multi-route flash
      innerSpellData,
    ]),
  );

  logger.debug(`Arb spell built: ${targets.length} outer target(s), ${innerTargets.length} inner target(s)`);
  return { targets, datas };
}

/**
 * Build a spell sequence for an Aave V3 liquidation via flash loan.
 *
 * Flow:
 *   1. Flash-borrow the debt token
 *   2. Call Aave liquidate on the underwater position
 *   3. Sell received collateral back to debt token to repay the flash loan
 *   4. Withdraw profit
 */
export function buildLiquidationSpell({
  debtToken,
  collateralToken,
  borrower,
  debtToCover,
  walletAddress,
}) {
  const targets = [];
  const datas = [];

  const innerTargets = [
    INSTADAPP.aaveConnector,
    INSTADAPP.uniswapConnector,
    INSTADAPP.basicConnector,
  ];

  const innerDatas = [
    AAVE_LIQUIDATE_IFACE.encodeFunctionData('liquidate', [
      collateralToken,
      debtToken,
      borrower,
      debtToCover,
      false, // receiveAToken = false → receive underlying
      0, 0,
    ]),
    UNISWAP_SWAP_IFACE.encodeFunctionData('sell', [
      debtToken,
      collateralToken,
      ethers.MaxUint256,
      0,
      3000, // 0.3 % fee tier as default
      0, 0,
    ]),
    BASIC_WITHDRAW_IFACE.encodeFunctionData('withdraw', [
      debtToken,
      ethers.MaxUint256,
      walletAddress,
      0, 0,
    ]),
  ];

  const innerSpellData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['string[]', 'bytes[]'],
    [innerTargets, innerDatas],
  );

  targets.push(INSTADAPP.flashloanConnector);
  datas.push(
    FLASHLOAN_IFACE.encodeFunctionData('flashBorrowAndCast', [
      debtToken,
      debtToCover,
      5,
      innerSpellData,
    ]),
  );

  logger.debug(`Liquidation spell built for borrower ${borrower}`);
  return { targets, datas };
}

function dexToUniFee(dexName) {
  switch (dexName) {
    case 'UniswapV3': return 3000;
    case 'SushiSwap': return 3000;
    case 'Curve':     return 500;
    default:          return 3000;
  }
}
