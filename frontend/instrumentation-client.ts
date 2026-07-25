// Sentry client-side init. Bails out gracefully when no DSN is provided (e.g., preview env).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
