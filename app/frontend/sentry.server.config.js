const Sentry = require("@sentry/nextjs");

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const enabled = process.env.NODE_ENV === "production" && Boolean(dsn);

Sentry.init({
  dsn,
  enabled,
  environment: "frontend",
  release: process.env.SENTRY_RELEASE || "memento@1.2.0",
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
  initialScope: {
    tags: {
      environment: "frontend",
      service: "ui",
    },
  },
});
