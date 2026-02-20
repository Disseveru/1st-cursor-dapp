import 'dotenv/config';

const requiredVars = ['RPC_URL_MAINNET'];

export function validateEnv() {
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

const config = {
  privateKey: process.env.PRIVATE_KEY || '',
  dsaId: parseInt(process.env.DSA_ID || '0', 10),

  rpc: {
    mainnet: process.env.RPC_URL_MAINNET || '',
    arbitrum: process.env.RPC_URL_ARBITRUM || '',
    base: process.env.RPC_URL_BASE || '',
  },

  flashbots: {
    relayUrl: process.env.FLASHBOTS_RELAY_URL || 'https://relay.flashbots.net',
    authKey: process.env.FLASHBOTS_AUTH_KEY || '',
  },

  killSwitch: {
    minEthBalance: parseFloat(process.env.MIN_ETH_BALANCE || '0.05'),
  },

  intervals: {
    arbitrage: parseInt(process.env.POLL_INTERVAL_ARB || '3000', 10),
    liquidation: parseInt(process.env.POLL_INTERVAL_LIQ || '5000', 10),
    crossChain: parseInt(process.env.POLL_INTERVAL_CROSS_CHAIN || '10000', 10),
  },

  thresholds: {
    minProfitArb: parseFloat(process.env.MIN_PROFIT_ARB || '0.005'),
    minProfitLiq: parseFloat(process.env.MIN_PROFIT_LIQ || '0.01'),
  },

  encryption: {
    enabled: process.env.ENCRYPT_KEY_AT_REST === 'true',
    password: process.env.KEY_ENCRYPTION_PASSWORD || '',
    keyFile: process.env.KEY_FILE || '.encrypted_key',
  },

  aws: {
    enabled: process.env.USE_AWS_SECRETS === 'true',
    secretName: process.env.AWS_SECRET_NAME || 'instadapp-bot/private-key',
    region: process.env.AWS_REGION || 'us-east-1',
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};

export default config;
