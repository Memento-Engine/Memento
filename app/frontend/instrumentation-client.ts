import * as Sentry from "@sentry/nextjs";
import { isDesktopProductionMode } from "./lib/runtimeMode";

const dsn = "https://a291be24371ccc5399d82f2b67fe8ab3@o4511037138206720.ingest.us.sentry.io/4511064036081664";
const enabled = isDesktopProductionMode() && Boolean(dsn);

console.info("[Sentry][browser-client] init", {
  enabled,
  mode: enabled ? "production" : "development",
  hasDsn: Boolean(dsn),
  dsnSource: "hardcoded",
});

Sentry.init({
  dsn,
  enabled,
  environment: "frontend",
  release: "memento@0.1.0",
  tracesSampleRate: 1.0,
  initialScope: {
    tags: {
      environment: "frontend",
      service: "ui",
    },
  },
});
