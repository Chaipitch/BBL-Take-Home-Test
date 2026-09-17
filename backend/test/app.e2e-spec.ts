import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Real tenant values; a request without a token is rejected before any JWKS fetch.
    // How e2e tests obtain tokens and config is decided in BBL-17.
    process.env.AUTH_ISSUER = 'https://dev-yg.us.auth0.com/';
    process.env.AUTH_AUDIENCE = 'https://bbl-candidate-test-api';
    process.env.AUTH_JWKS_URI = 'https://dev-yg.us.auth0.com/.well-known/jwks.json';
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
