class StatusReporter {
  constructor({ logger }) {
    this.logger = logger;
    this.startedAt = null;
    this.cycleCount = 0;
    this.opportunitiesFound = 0;
    this.opportunitiesExecuted = 0;
    this.lastCycleAt = null;
    this.lastExecutionAt = null;
    this.lastExecutionLabel = null;
    this.killSwitchActivated = false;
    this.errors = 0;
    this.retries = 0;
  }

  start() {
    this.startedAt = new Date();
  }

  recordCycle() {
    this.cycleCount++;
    this.lastCycleAt = new Date();
  }

  recordOpportunitiesFound(count) {
    this.opportunitiesFound += count;
  }

  recordExecution(label) {
    this.opportunitiesExecuted++;
    this.lastExecutionAt = new Date();
    this.lastExecutionLabel = label;
  }

  recordError() {
    this.errors++;
  }

  recordRetry() {
    this.retries++;
  }

  recordKillSwitch() {
    this.killSwitchActivated = true;
  }

  uptimeMs() {
    if (!this.startedAt) return 0;
    return Date.now() - this.startedAt.getTime();
  }

  getStatus() {
    return {
      startedAt: this.startedAt?.toISOString() ?? null,
      uptimeMs: this.uptimeMs(),
      cycleCount: this.cycleCount,
      opportunitiesFound: this.opportunitiesFound,
      opportunitiesExecuted: this.opportunitiesExecuted,
      lastCycleAt: this.lastCycleAt?.toISOString() ?? null,
      lastExecutionAt: this.lastExecutionAt?.toISOString() ?? null,
      lastExecutionLabel: this.lastExecutionLabel,
      killSwitchActivated: this.killSwitchActivated,
      errors: this.errors,
      retries: this.retries,
    };
  }

  logStatus() {
    this.logger.info(this.getStatus(), "Bot status report");
  }
}

module.exports = { StatusReporter };
