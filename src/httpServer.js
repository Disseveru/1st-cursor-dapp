const express = require("express");
const path = require("path");
const { getRiskProfiles, getRiskProfileById } = require("./riskProfiles");

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
        roadmap: {
          phase1: {
            status: "completed",
            deliverables: [
              "Searcher engine with safeguards (Flashbots, kill-switch, retries, status reporting)",
              "Configurable monitoring/execution stack",
              "Basic dashboard/API for visibility",
            ],
          },
          phase2: {
            status: "next",
            deliverables: [
              "Non-custodial vault contracts for pooled strategy execution",
              "Wallet-first UI with risk profile onboarding",
              "Deposit/withdraw UX and strategy selection",
            ],
          },
          phase3: {
            status: "planned",
            deliverables: [
              "Production analytics, user notifications, and policy controls",
              "Multi-strategy routing and governance-managed parameters",
            ],
          },
        },
        phase2Ready: true,
        note: "Phase 1 execution infrastructure is complete; Phase 2 vault and wallet UX work can begin.",
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
