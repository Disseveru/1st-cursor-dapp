import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { approxToEth } from './gasEstimator.js';

describe('gasEstimator', () => {
  describe('approxToEth', () => {
    it('should convert token amount to approximate ETH value', () => {
      // If ETH costs 2000 USDC, then 4000 USDC ≈ 2 ETH
      const amount = 4000n * 10n ** 6n; // 4000 USDC (6 decimals)
      const ethPrice = 2000n * 10n ** 6n; // 2000 USDC per ETH
      const result = approxToEth(amount, 6, ethPrice);

      // result should be ≈ 2 ETH in wei
      assert.equal(result, ethers.parseEther('2'));
    });

    it('should return 0 when ethPriceInToken is 0', () => {
      const result = approxToEth(1000n, 6, 0n);
      assert.equal(result, 0n);
    });
  });
});
