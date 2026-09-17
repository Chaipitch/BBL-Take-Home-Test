// Cross-cutting API rules checked over the whole running app: every input is schema-validated
// (ADR-013f), errors are Problem Details (ADR-012a), CORS allows only the SPA (ADR-003, 013j).
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { z } from 'zod';
import { ValidBody, ValidQuery } from '../src/common/validation.js';
import { createTestApp, type TestApp } from './support/app.js';
import { findUnvalidatedParams } from './support/guardrails.js';
import { resetDatabase } from './support/db.js';

describe('API guardrails (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ imports: [DiscoveryModule] });
    await resetDatabase(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('every controller parameter is validated (ADR-013f)', () => {
    it('the checker itself flags bare @Body, @Query, property-level params and unpiped @Param', () => {
      @Controller()
      class Unsafe {
        @Post() a(@Body() _b: unknown) {}
        @Get() b(@Query() _q: unknown) {}
        @Get('x') c(@Query('name') _n: string) {}
        @Get(':id') d(@Param('id') _id: string) {}
        @Post('ok') e(@ValidBody(z.strictObject({})) _b: unknown, @ValidQuery(z.strictObject({})) _q: unknown) {}
      }
      expect(findUnvalidatedParams(Unsafe)).toEqual([
        'Unsafe.a arg #0: body without a schema',
        'Unsafe.b arg #0: query without a schema',
        'Unsafe.c arg #0: query without a schema',
        'Unsafe.c arg #0: property-level query ("name")',
        'Unsafe.d arg #0: path param without a pipe',
      ]);
    });

    it('no registered controller has an unvalidated body, query or path param', () => {
      const controllers = t.app
        .get(DiscoveryService)
        .getControllers()
        .map((wrapper) => wrapper.metatype as new (...args: never[]) => unknown);

      expect(controllers.map((c) => c.name)).toEqual(expect.arrayContaining(['BookmarksController', 'CollectionsController', 'MeController']));
      expect(controllers.flatMap(findUnvalidatedParams)).toEqual([]);
    });
  });

  describe('errors are RFC 9457 Problem Details', () => {
    it('401 has the same body for no token and a bad token, with WWW-Authenticate', async () => {
      const none = await t.http().get('/collections');
      const bad = await t.http().get('/collections').set('Authorization', 'Bearer garbage');

      for (const res of [none, bad]) {
        expect(res.status).toBe(401);
        expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      }
      expect(none.body).toEqual({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        code: 'unauthorized',
        detail: 'Authentication is required',
      });
      expect(bad.body).toEqual(none.body);
      expect(none.headers['www-authenticate']).toBe('Bearer');
      expect(bad.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    });

    it('unknown route → 404 not_found problem', async () => {
      const a = await t.as('auth0|user-a');
      const res = await a.get('/nope');
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'not_found', detail: 'The requested resource was not found' });
    });
  });

  describe('CORS (ADR-003)', () => {
    it('preflight from the SPA origin is allowed with Authorization header', async () => {
      const res = await t
        .http()
        .options('/collections')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/);
    });

    it('other origins get no CORS allow header', async () => {
      const res = await t.http().options('/collections').set('Origin', 'https://evil.test').set('Access-Control-Request-Method', 'GET');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('actual responses expose Location to the SPA', async () => {
      const a = await t.as('auth0|user-a');
      const res = await a.post('/collections').set('Origin', 'http://localhost:3000').send({ name: 'x' }).expect(201);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-expose-headers']).toMatch(/Location/);
    });
  });
});
