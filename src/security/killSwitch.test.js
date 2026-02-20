import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// Reset module state between tests by dynamically importing
let checkKillSwitch, isHalted, resetKillSwitch;

describe('KillSwitch', () => {
  beforeEach(async () => {
    // Force fresh module load by using a cache-busting query param
    const mod = await import(`./killSwitch.js?t=${Date.now()}`);
    checkKillSwitch = mod.checkKillSwitch;
    isHalted = mod.isHalted;
    resetKillSwitch = mod.resetKillSwitch;
  });

  it('should return true when balance is above threshold', async () => {
    const mockProvider = {
      getBalance: async () => 100000000000000000n, // 0.1 ETH
    };
    const result = await checkKillSwitch(mockProvider, '0xtest');
    assert.equal(result, true);
  });

  it('should halt when balance is below threshold', async () => {
    const mockProvider = {
      getBalance: async () => 1000000000000000n, // 0.001 ETH
    };
    const result = await checkKillSwitch(mockProvider, '0xtest');
    assert.equal(result, false);
  });

  it('resetKillSwitch should allow operations to resume', async () => {
    const lowProvider = {
      getBalance: async () => 1000n,
    };
    await checkKillSwitch(lowProvider, '0xtest');

    resetKillSwitch();

    const highProvider = {
      getBalance: async () => 100000000000000000n,
    };
    const result = await checkKillSwitch(highProvider, '0xtest');
    assert.equal(result, true);
  });
});
