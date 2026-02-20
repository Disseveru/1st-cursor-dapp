const Web3 = require("web3");
const DSA = require("dsa-sdk");

async function createInstadappClient({ rpcUrl, privateKey, dsaId, origin, logger }) {
  const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
  const dsa = new DSA({
    web3,
    mode: "node",
    privateKey,
  });

  if (origin) {
    dsa.setOrigin(origin);
  }

  const account = web3.eth.accounts.privateKeyToAccount(privateKey);

  logger.info({ dsaId, signer: account.address }, "Initializing Instadapp DSA instance");

  await dsa.setInstance(dsaId);
  logger.info(
    { dsaAddress: dsa.instance.address, dsaVersion: dsa.instance.version },
    "Instadapp DSA instance loaded",
  );

  return {
    dsa,
    web3,
    signerAddress: account.address,
  };
}

module.exports = { createInstadappClient };
