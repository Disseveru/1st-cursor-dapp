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
        note: "This repository currently provides the automation/searcher engine and dashboard scaffolding.",
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
