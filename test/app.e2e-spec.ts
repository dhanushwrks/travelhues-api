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
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;

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

  it('refuses creator signup without an invite', () => {
    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'asha@travelhues.test',
        password: 'travel1',
        displayName: 'Asha',
        role: 'tcc',
      })
      .expect(400);
  });

  it('stores a waitlist request and opens an invite', async () => {
    await request(app.getHttpServer())
      .post('/waitlist')
      .send({
        name: 'Asha',
        country: 'IN',
        dateOfBirth: '1992-04-03',
        socials: [{ platform: 'instagram', url: 'https://instagram.com/asha' }],
        handle: 'asha-wait',
        bio: 'I film slow trains and night markets across the south.',
        hobbies: ['trains'],
        countriesTraveled: ['TH'],
      })
      .expect(201);

    const listed = await request(app.getHttpServer())
      .get('/admin/waitlist')
      .set('Authorization', 'Bearer test-token')
      .expect(200);
    const requestId = listed.body[0]?.id as string;
    if (!requestId) throw new Error('missing waitlist request');

    await request(app.getHttpServer())
      .post(`/admin/waitlist/${requestId}/status`)
      .set('Authorization', 'Bearer test-token')
      .send({ status: 'accepted' })
      .expect(201);

    const invite = await request(app.getHttpServer())
      .post('/admin/invites')
      .set('Authorization', 'Bearer test-token')
      .send({ expiresInDays: 7, waitlistId: requestId })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/invites/${invite.body.token}`)
      .expect(200)
      .expect((response) => {
        if (response.body.prefill?.handle !== 'asha-wait') {
          throw new Error('invite did not keep the waitlist handle');
        }
      });
  });

  it('lists flight deals by origin after admin create', async () => {
    const stories = await request(app.getHttpServer())
      .get('/admin/stories')
      .set('Authorization', 'Bearer test-token')
      .expect(200);
    const story = stories.body[0];
    if (!story?.slug || !story?.creator?.username) return;

    const created = await request(app.getHttpServer())
      .post('/admin/flight-deals')
      .set('Authorization', 'Bearer test-token')
      .send({
        originIata: 'BLR',
        destinationIata: 'BKK',
        destinationCity: story.destination?.name ?? 'Bangkok',
        destinationCountry: story.destination?.country ?? 'TH',
        departureDate: '2026-11-01',
        priceInr: 12999,
        affiliateUrl: 'https://example.com/book',
        storyCreatorUsername: story.creator.username,
        storySlug: story.slug,
        status: 'published',
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/flight-deals?origin=BLR')
      .expect(200)
      .expect((response) => {
        if (!Array.isArray(response.body) || response.body.length < 1) {
          throw new Error('expected at least one deal');
        }
        if (response.body[0].id !== created.body.id) {
          throw new Error('expected created deal in list');
        }
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
