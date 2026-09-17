import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Real tenant config comes from vitest.config.e2e.ts; a request without a token is rejected
    // before any JWKS fetch.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) requires authentication (global guard, ADR-010b)', () => {
    return request(app.getHttpServer()).get('/').expect(401).expect('WWW-Authenticate', 'Bearer');
  });

  afterEach(async () => {
    await app.close();
  });
});
