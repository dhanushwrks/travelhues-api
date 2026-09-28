import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

process.env.STORE_PATH = join(mkdtempSync(join(tmpdir(), 'travelhues-')), 'store.json');
process.env.ADMIN_TOKEN = 'test-token';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('travelhues-api');
  });

  it('rejects admin routes without a token', () => {
    return request(app.getHttpServer()).get('/admin/settings').expect(401);
  });

  it('returns settings with the admin token', () => {
    return request(app.getHttpServer())
      .get('/admin/settings')
      .set('Authorization', 'Bearer test-token')
      .expect(200)
      .expect((response) => {
        if (response.body.app.name !== 'Travelhues') {
          throw new Error('expected the Travelhues app name');
        }
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
