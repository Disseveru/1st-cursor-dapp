#!/usr/bin/env node
const dotenv = require("dotenv");
const Web3 = require("web3");
const DSA = require("dsa-sdk");
const { Wallet } = require("ethers");
const { createSafe, setRpcUrls } = require("@instadapp/avocado");
const { providers, Wallet: WalletV5 } = require("ethers-v5");

dotenv.config();

function parseJsonEnv(name, fallback = {}) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`);
  }
}

function formatEthFromWei(web3, wei) {
  return web3.utils.fromWei(String(wei), "ether");
}

async function deriveSafeAddress() {
  const chainRpcJson = parseJsonEnv("CHAIN_RPC_JSON", {});
  setRpcUrls({
    1: process.env.ETHEREUM_RPC_URL,
    137: chainRpcJson["137"],
    42161: process.env.ARBITRUM_RPC_URL,
    634: process.env.AVOCADO_RPC_URL || "https://rpc.avocado.instadapp.io",
  });

  const provider = new providers.StaticJsonRpcProvider(
    process.env.AVOCADO_RPC_URL || "https://rpc.avocado.instadapp.io",
    { chainId: 634, name: "avocado" },
  );
  const wallet = new WalletV5(process.env.PRIVATE_KEY, provider);
  const safe = createSafe(wallet, provider);
  return safe.getSafeAddress();
}

async function status() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required");
  }
  if (!process.env.ETHEREUM_RPC_URL) {
    throw new Error("ETHEREUM_RPC_URL is required");
  }

  const owner = new Wallet(process.env.PRIVATE_KEY).address;
  const derivedSafe = await deriveSafeAddress();
  const configuredSafe = process.env.AVOCADO_SAFE_ADDRESS || derivedSafe;

  const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETHEREUM_RPC_URL));
  const dsa = new DSA({ web3, mode: "node", privateKey: process.env.PRIVATE_KEY });

  const ownerBalanceWei = await web3.eth.getBalance(owner);
  const gasPriceWei = await web3.eth.getGasPrice();
  const txObj = await dsa.buildTxObj({
    authority: configuredSafe,
    from: owner,
    gasPrice: gasPriceWei,
  });
  const buildCostWei = BigInt(txObj.gas) * BigInt(txObj.gasPrice);
  const shortfallWei = buildCostWei > BigInt(ownerBalanceWei) ? buildCostWei - BigInt(ownerBalanceWei) : 0n;
  const accounts = await dsa.getAccounts(configuredSafe);

  console.log(
    JSON.stringify(
      {
        ownerAddress: owner,
        configuredSafeAddress: configuredSafe,
        derivedSafeAddress: derivedSafe,
        safeMatch: configuredSafe.toLowerCase() === derivedSafe.toLowerCase(),
        ownerBalanceEth: formatEthFromWei(web3, ownerBalanceWei),
        estimatedBuildCostEth: formatEthFromWei(web3, buildCostWei),
        shortfallEth: formatEthFromWei(web3, shortfallWei),
        dsaAccountsForSafe: accounts,
      },
      null,
      2,
    ),
  );
}

async function buildDsa() {
  if (!process.env.PRIVATE_KEY || !process.env.ETHEREUM_RPC_URL) {
    throw new Error("PRIVATE_KEY and ETHEREUM_RPC_URL are required");
  }

  const owner = new Wallet(process.env.PRIVATE_KEY).address;
  const derivedSafe = await deriveSafeAddress();
  const configuredSafe = process.env.AVOCADO_SAFE_ADDRESS || derivedSafe;
  const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETHEREUM_RPC_URL));
  const dsa = new DSA({ web3, mode: "node", privateKey: process.env.PRIVATE_KEY });
  const ownerBalanceWei = await web3.eth.getBalance(owner);
  const gasPriceWei = await web3.eth.getGasPrice();
  const buildTx = await dsa.buildTxObj({
    authority: configuredSafe,
    from: owner,
    gasPrice: gasPriceWei,
  });
  const buildCostWei = BigInt(buildTx.gas) * BigInt(buildTx.gasPrice);
  const shortfallWei = buildCostWei > BigInt(ownerBalanceWei) ? buildCostWei - BigInt(ownerBalanceWei) : 0n;

  const existing = await dsa.getAccounts(configuredSafe);
  if (existing.length) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "already-exists",
          ownerAddress: owner,
          safeAddress: configuredSafe,
          dsaAccounts: existing,
          suggestedDsaId: existing[existing.length - 1].id,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (shortfallWei > 0n) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          action: "insufficient-funds",
          ownerAddress: owner,
          safeAddress: configuredSafe,
          ownerBalanceEth: formatEthFromWei(web3, ownerBalanceWei),
          estimatedBuildCostEth: formatEthFromWei(web3, buildCostWei),
          shortfallEth: formatEthFromWei(web3, shortfallWei),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const txHash = await dsa.build({
    authority: configuredSafe,
    from: owner,
    gasPrice: gasPriceWei,
  });

  const created = await dsa.getAccounts(configuredSafe);
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "built",
        txHash,
        ownerAddress: owner,
        safeAddress: configuredSafe,
        dsaAccounts: created,
        suggestedDsaId: created.length ? created[created.length - 1].id : null,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const action = process.argv[2] || "status";
  if (action === "status") {
    await status();
    return;
  }
  if (action === "build") {
    await buildDsa();
    return;
  }
  throw new Error(`Unknown action '${action}'. Use 'status' or 'build'.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
