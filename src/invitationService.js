function normalizeInvitationCode(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function extractInvitationCode(payload = {}) {
  const directValues = [
    payload.invitationCode,
    payload.inviteCode,
    payload.code,
    payload.invitationId,
  ];

  for (const value of directValues) {
    const normalized = normalizeInvitationCode(value);
    if (normalized) {
      return normalized;
    }
  }

  const commandText = [payload.message, payload.text].find((value) => typeof value === "string");
  if (typeof commandText === "string" && /\baccept\s+my\s+invitation\b/i.test(commandText)) {
    return "my-invitation";
  }

  return null;
}

function normalizeInvitee(value) {
  if (typeof value !== "string") return "guest";
  const trimmed = value.trim();
  return trimmed || "guest";
}

class InvitationService {
  constructor({ logger, now = () => new Date() } = {}) {
    this.logger = logger;
    this.now = now;
    this.acceptedInvitations = new Map();
  }

  acceptInvitation(payload = {}) {
    const invitationCode = extractInvitationCode(payload);
    if (!invitationCode) {
      throw new Error("Invitation code is required");
    }

    const existing = this.acceptedInvitations.get(invitationCode);
    if (existing) {
      return {
        invitationCode,
        invitee: existing.invitee,
        acceptedAt: existing.acceptedAt,
        status: "already-accepted",
        message: "Invitation already accepted",
      };
    }

    const invitee = normalizeInvitee(payload.invitee);
    const acceptedAt = this.now().toISOString();
    this.acceptedInvitations.set(invitationCode, {
      invitee,
      acceptedAt,
    });

    this.logger?.info?.({ invitationCode, invitee }, "Invitation accepted");

    return {
      invitationCode,
      invitee,
      acceptedAt,
      status: "accepted",
      message: "Invitation accepted",
    };
  }

  getInvitation(invitationCode) {
    const normalizedCode = normalizeInvitationCode(invitationCode);
    if (!normalizedCode) {
      throw new Error("Invitation code is required");
    }

    const invitation = this.acceptedInvitations.get(normalizedCode);
    if (!invitation) return null;

    return {
      invitationCode: normalizedCode,
      invitee: invitation.invitee,
      acceptedAt: invitation.acceptedAt,
      status: "accepted",
    };
  }
}

module.exports = {
  InvitationService,
  extractInvitationCode,
  normalizeInvitationCode,
};
