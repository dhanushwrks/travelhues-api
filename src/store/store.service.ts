import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { thailand } from '../content/thailand.js';
import type { Story } from '../content/content.types.js';
import type { Settings } from './store.types.js';

type StoreFile = {
  settings: Settings;
  stories: Story[];
};

export function defaultSettings(): Settings {
  return {
    app: {
      name: 'Travelhues',
      tagline: 'Stories, spots, and the days between them.',
      publicUrl: 'http://localhost:3001',
      mapsEnabled: true,
    },
    api: {
      corsOrigins: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
      ],
      contentPublished: true,
    },
  };
}

@Injectable()
export class StoreService implements OnModuleInit {
  private data: StoreFile = {
    settings: defaultSettings(),
    stories: [],
  };
  private queue: Promise<void> = Promise.resolve();
  private ready: Promise<void> = Promise.resolve();

  async onModuleInit() {
    this.ready = this.load();
    await this.ready;
  }

  getSettings(): Settings {
    return structuredClone(this.data.settings);
  }

  getStories(): Story[] {
    return structuredClone(this.data.stories);
  }

  async update(mutator: (draft: StoreFile) => void): Promise<void> {
    await this.ready;
    const run = this.queue.then(async () => {
      mutator(this.data);
      await this.persist();
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  private storePath() {
    return process.env.STORE_PATH ?? 'data/store.json';
  }

  private async load() {
    try {
      const raw = await readFile(this.storePath(), 'utf8');
      const parsed = JSON.parse(raw) as StoreFile;
      if (!parsed.settings?.app || !parsed.settings.api || !Array.isArray(parsed.stories)) {
        throw new Error('Store file is missing settings or stories');
      }
      this.data = parsed;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : undefined;
      if (code !== 'ENOENT') throw error;
      this.data = {
        settings: defaultSettings(),
        stories: structuredClone([thailand]),
      };
      await this.persist();
    }
  }

  private async persist() {
    const path = this.storePath();
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, `${JSON.stringify(this.data, null, 2)}\n`);
    await rename(tmp, path);
  }
}
