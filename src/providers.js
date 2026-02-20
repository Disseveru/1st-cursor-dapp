const { JsonRpcProvider } = require("ethers");

function createProviderMap(chainRpcUrls) {
  const providers = {};
  for (const [chainIdRaw, rpcUrl] of Object.entries(chainRpcUrls)) {
    const chainId = Number(chainIdRaw);
    providers[chainId] = new JsonRpcProvider(rpcUrl, chainId);
  }
  return providers;
}

function getProviderOrThrow(providers, chainId) {
  const provider = providers[Number(chainId)];
  if (!provider) {
    throw new Error(`Missing provider for chainId ${chainId}`);
  }
  return provider;
}

module.exports = {
  createProviderMap,
  getProviderOrThrow,
};
