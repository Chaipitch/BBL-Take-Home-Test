import type { INestApplication } from '@nestjs/common';

export const FRONTEND_ORIGIN = 'http://localhost:3000';

/** App-level HTTP configuration shared by main.ts and e2e tests, so tests exercise the real setup. */
export function configureApp(app: INestApplication): void {
  // ADR-003 / ADR-013j: only the SPA origin may call the API from a browser.
  // An array makes `cors` compare the request Origin and omit the header on mismatch; a plain string
  // is echoed to every caller (harmless in browsers, but found misleading by the e2e test).
  app.enableCors({
    origin: [FRONTEND_ORIGIN],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['Location', 'WWW-Authenticate'],
  });
}
