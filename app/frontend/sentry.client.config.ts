const Sentry = require("@sentry/nextjs");
const { isDesktopProductionMode } = require("./lib/runtimeMode");

const dsn = "https://a291be24371ccc5399d82f2b67fe8ab3@o4511037138206720.ingest.us.sentry.io/4511064036081664";
const enabled = isDesktopProductionMode() && Boolean(dsn);

console.info("[Sentry][edge] init", {
  enabled,
  mode: enabled ? "production" : "development",
  hasDsn: Boolean(dsn),
  dsnSource: "hardcoded",
});


Sentry.init({
  dsn,
  enabled,
  environment: "frontend",
  release: "memento@1.2.0",
  tracesSampleRate: 0.1,
  initialScope: {
    tags: {
      environment: "frontend",
      service: "ui",
    },
  },
});
