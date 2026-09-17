import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { listenOnLoopback } from './support/app.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
    // Real tenant config comes from vitest.config.e2e.ts; a request without a token is rejected
    // before any JWKS fetch.
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    baseUrl = await listenOnLoopback(app);
  });

  it('/ (GET) requires authentication (global guard, ADR-010b)', () => {
    return request(baseUrl).get('/').expect(401).expect('WWW-Authenticate', 'Bearer');
  });

  afterEach(async () => {
    await app.close();
  });
});
