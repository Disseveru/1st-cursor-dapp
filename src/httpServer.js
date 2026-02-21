const express = require("express");
const path = require("path");
const { getRiskProfiles, getRiskProfileById } = require("./riskProfiles");

const ROADMAP_PHASES = Object.freeze([
  {
    phase: 1,
    title: "Searcher engine foundation",
    status: "complete",
    items: [
      "Safeguards: Flashbots private relay, kill-switch, retry handling, and status reporting",
      "Configurable monitoring/execution stack for arbitrage, liquidation, and cross-chain checks",
      "Operator visibility through dashboard + API endpoints",
    ],
  },
  {
    phase: 2,
    title: "Consumer vault UX + contracts",
    status: "next",
    items: [
      "Non-custodial vault contracts for pooled strategy execution",
      "Wallet-first onboarding and risk profile selection",
      "Deposit/withdraw user flow with strategy selection",
    ],
  },
  {
    phase: 3,
    title: "Production analytics and controls",
    status: "planned",
    items: [
      "Analytics, notifications, and policy controls",
      "Multi-strategy routing and governance-managed parameters",
    ],
  },
]);

function createHttpServer({ config, statusReporter, logger }) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "instadapp-searcher-bot" });
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      ok: true,
      status: statusReporter?.getStatus?.() || null,
    });
  });

  app.get("/api/risk-profiles", (_req, res) => {
    res.json({
      ok: true,
      data: getRiskProfiles(),
    });
  });

  app.get("/api/risk-profiles/:id", (req, res) => {
    const profile = getRiskProfileById(req.params.id);
    if (!profile) {
      return res.status(404).json({ ok: false, error: "Risk profile not found" });
    }
    return res.json({ ok: true, data: profile });
  });

  app.get("/api/vision", (_req, res) => {
    res.json({
      ok: true,
      data: {
        userFlow: [
          "Connect wallet",
          "Choose risk profile",
          "Deposit into non-custodial strategy vault",
          "Track performance and withdraw anytime",
        ],
        note: "Phase 1 is complete. This repository now transitions to Phase 2 build-out.",
      },
    });
  });

  app.get("/api/roadmap", (_req, res) => {
    res.json({
      ok: true,
      data: {
        currentPhase: 2,
        previousPhase: 1,
        phases: ROADMAP_PHASES,
      },
    });
  });

  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  const server = app.listen(config.app.webPort, config.app.webHost, () => {
    logger.info(
      { host: config.app.webHost, port: config.app.webPort },
      "User dashboard/API server started",
    );
  });

  return {
    app,
    server,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) return reject(error);
          return resolve();
        });
      });
    },
  };
}

module.exports = { createHttpServer };
