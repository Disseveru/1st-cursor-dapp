const express = require("express");
const path = require("path");
const { getRiskProfiles, getRiskProfileById } = require("./riskProfiles");
const { ConsumerVaultService } = require("./consumerVaultService");

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error: error.message });
}

function createHttpServer({ config, statusReporter, logger, consumerVaultService }) {
  const app = express();
  const vaultService = consumerVaultService || new ConsumerVaultService({ logger });
  app.use(express.json({ limit: "100kb" }));

  function statusSnapshot() {
    return statusReporter?.getStatus?.() || null;
  }

  function syncVaultWithStatus() {
    vaultService.syncFromStatus(statusSnapshot());
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "instadapp-searcher-bot" });
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      ok: true,
      status: statusSnapshot(),
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
        note: "Roadmap passes are implemented through API-first consumer vault, analytics, notifications, and policy controls.",
      },
    });
  });

  app.get("/api/strategies", (_req, res) => {
    res.json({
      ok: true,
      data: vaultService.listStrategies(),
    });
  });

  app.get("/api/vault", (_req, res) => {
    syncVaultWithStatus();
    res.json({
      ok: true,
      data: vaultService.getVaultStats(),
    });
  });

  app.get("/api/portfolio/:wallet", (req, res) => {
    try {
      syncVaultWithStatus();
      return res.json({
        ok: true,
        data: {
          portfolio: vaultService.getPortfolio(req.params.wallet),
          notifications: vaultService.getNotificationPreference(req.params.wallet),
        },
      });
    } catch (error) {
      return badRequest(res, error);
    }
  });

  app.post("/api/vault/deposit", (req, res) => {
    try {
      syncVaultWithStatus();
      const result = vaultService.deposit({
        wallet: req.body?.wallet,
        amountEth: req.body?.amountEth,
        strategyId: req.body?.strategyId,
      });
      return res.json({ ok: true, data: result });
    } catch (error) {
      return badRequest(res, error);
    }
  });

  app.post("/api/vault/withdraw", (req, res) => {
    try {
      syncVaultWithStatus();
      const result = vaultService.withdraw({
        wallet: req.body?.wallet,
        amountEth: req.body?.amountEth,
      });
      return res.json({ ok: true, data: result });
    } catch (error) {
      return badRequest(res, error);
    }
  });

  app.get("/api/policy-controls", (_req, res) => {
    res.json({
      ok: true,
      data: vaultService.getPolicyControls(),
    });
  });

  app.put("/api/policy-controls", (req, res) => {
    try {
      const updated = vaultService.updatePolicyControls(req.body || {});
      return res.json({ ok: true, data: updated });
    } catch (error) {
      return badRequest(res, error);
    }
  });

  app.get("/api/notifications/:wallet", (req, res) => {
    try {
      return res.json({
        ok: true,
        data: vaultService.getNotificationPreference(req.params.wallet),
      });
    } catch (error) {
      return badRequest(res, error);
    }
  });

  app.put("/api/notifications/:wallet", (req, res) => {
    try {
      const updated = vaultService.updateNotificationPreference(req.params.wallet, req.body || {});
      return res.json({ ok: true, data: updated });
    } catch (error) {
      return badRequest(res, error);
    }
  });

  app.get("/api/analytics", (_req, res) => {
    syncVaultWithStatus();
    res.json({
      ok: true,
      data: vaultService.getAnalytics({ status: statusSnapshot() }),
    });
  });

  app.get("/api/roadmap", (_req, res) => {
    res.json({
      ok: true,
      data: vaultService.getRoadmapStatus(),
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
    vaultService,
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
