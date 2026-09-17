// Exercises the real fetch path against a local HTTP server standing in for Auth0 /userinfo.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { testAuthConfig } from '../../test/support/tokens.js';
import { UserInfoClient } from './userinfo.client.js';

describe('UserInfoClient', () => {
  let server: Server;
  let baseUrl: string;
  let handler: (req: IncomingMessage, res: ServerResponse) => void;
  let seenAuthorization: string | undefined;

  const client = (timeoutMs = 200) =>
    new UserInfoClient({ ...testAuthConfig, userinfoUri: new URL(`${baseUrl}/userinfo`) }, timeoutMs);

  beforeAll(async () => {
    server = createServer((req, res) => {
      seenAuthorization = req.headers.authorization;
      handler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const json = (status: number, body: unknown) => (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  };

  it('returns claims and sends the access token as a Bearer credential', async () => {
    handler = json(200, { sub: 'auth0|a', email: 'A@Test.com', email_verified: true, name: 'A', picture: 'p' });
    await expect(client().fetch('the-token')).resolves.toEqual({
      kind: 'ok',
      claims: { sub: 'auth0|a', email: 'A@Test.com', email_verified: true, name: 'A', picture: 'p' },
    });
    expect(seenAuthorization).toBe('Bearer the-token');
  });

  it('401 → unauthorized', async () => {
    handler = json(401, { error: 'invalid_token' });
    await expect(client().fetch('t')).resolves.toEqual({ kind: 'unauthorized' });
  });

  it.each([
    [429, 'http_429'],
    [500, 'http_500'],
    [503, 'http_503'],
    [403, 'http_403'],
  ])('%i → unavailable (%s)', async (status, reason) => {
    handler = json(status, {});
    await expect(client().fetch('t')).resolves.toEqual({ kind: 'unavailable', reason });
  });

  it('a redirect is not followed → unavailable', async () => {
    handler = (_req, res) => res.writeHead(302, { Location: 'https://evil.test/userinfo' }).end();
    await expect(client().fetch('t')).resolves.toEqual({ kind: 'unavailable', reason: 'network' });
  });

  it('invalid JSON → unavailable', async () => {
    handler = (_req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end('{not json');
    await expect(client().fetch('t')).resolves.toEqual({ kind: 'unavailable', reason: 'invalid_json' });
  });

  it('body without a string sub → unavailable', async () => {
    handler = json(200, { email: 'a@test.com' });
    await expect(client().fetch('t')).resolves.toEqual({ kind: 'unavailable', reason: 'invalid_body' });
  });

  it('slower than the timeout → unavailable (timeout), without waiting for the response', async () => {
    handler = (_req, res) => setTimeout(() => json(200, { sub: 'late' })(_req, res), 1000);
    const started = Date.now();
    await expect(client(100).fetch('t')).resolves.toEqual({ kind: 'unavailable', reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(800);
  });

  it('connection refused → unavailable (network)', async () => {
    const closed = new UserInfoClient({ ...testAuthConfig, userinfoUri: new URL('http://127.0.0.1:9/userinfo') }, 200);
    await expect(closed.fetch('t')).resolves.toEqual({ kind: 'unavailable', reason: 'network' });
  });

  it('defaults to a 3 s timeout (ADR-011e)', () => {
    expect((new UserInfoClient(testAuthConfig) as unknown as { timeoutMs: number }).timeoutMs).toBe(3000);
  });
});
