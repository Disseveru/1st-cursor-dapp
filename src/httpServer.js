const express = require("express");
const path = require("path");
const { getRiskProfiles, getRiskProfileById } = require("./riskProfiles");
const { InvitationService } = require("./invitationService");

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error: error.message });
}

function createHttpServer({ config, statusReporter, logger, invitationService }) {
  const app = express();
  const inviteService = invitationService || new InvitationService({ logger });
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
          "Accept invitation",
          "Choose risk profile",
          "Deposit into non-custodial strategy vault",
          "Track performance and withdraw anytime",
        ],
        note: "This repository currently provides the automation/searcher engine and dashboard scaffolding.",
      },
    });
  });

  function handleAcceptInvitation(req, res) {
    try {
      const accepted = inviteService.acceptInvitation(req.body || {});
      return res.json({
        ok: true,
        data: accepted,
      });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  app.post("/api/invitations/accept", handleAcceptInvitation);
  app.post("/api/invitation/accept", handleAcceptInvitation);

  app.get("/api/invitations/:invitationCode", (req, res) => {
    try {
      const invitation = inviteService.getInvitation(req.params.invitationCode);
      if (!invitation) {
        return res.status(404).json({ ok: false, error: "Invitation not found" });
      }
      return res.json({ ok: true, data: invitation });
    } catch (error) {
      return badRequest(res, error);
    }
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
    inviteService,
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
