"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { isDesktopProductionMode } from "../lib/runtimeMode";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isDesktopProductionMode()) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html>
      <body>
        <h2>Something went wrong</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
