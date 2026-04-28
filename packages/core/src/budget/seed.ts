// Seed the rate_table from JSON files under <coreRoot>/rates/.
//
// Phase 8.4 (D19): JSON externalization. New models add a row in the
// JSON, no TS source change required. Loader idempotent — re-seeding
// is a no-op when the (provider, model, effective_from) row exists.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { Db } from '../workspace/db.js';
import { getRate, insertRate } from '../workspace/dao/rate_table.js';

const RateEntrySchema = z.object({
  model: z.string().min(1),
  tokens_in_per_usd: z.number().positive(),
  tokens_out_per_usd: z.number().positive(),
  effective_from: z.string().min(1),
});

const RateFileSchema = z.object({
  provider: z.string().min(1),
  rates: z.array(RateEntrySchema),
});

interface SeedRatesResult {
  inserted: number;
  skipped: number;
  files: number;
}

/**
 * Read every `*.json` under `ratesDir` (default `<coreRoot>/rates/`)
 * and insert each entry. Existing (provider, model, effective_from)
 * rows are skipped — safe to call on every startup.
 */
export function seedRatesFromJson(db: Db, ratesDir?: string): SeedRatesResult {
  const dir = ratesDir ?? defaultRatesDir();
  if (!fs.existsSync(dir)) {
    return { inserted: 0, skipped: 0, files: 0 };
  }
  let inserted = 0;
  let skipped = 0;
  let files = 0;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    files += 1;
    const raw = fs.readFileSync(path.join(dir, entry), 'utf8');
    const parsed = RateFileSchema.parse(JSON.parse(raw));
    for (const rate of parsed.rates) {
      const existing = getRate(db, parsed.provider, rate.model, rate.effective_from);
      if (existing) {
        skipped += 1;
        continue;
      }
      insertRate(db, {
        provider: parsed.provider,
        model: rate.model,
        tokens_in_per_usd: rate.tokens_in_per_usd,
        tokens_out_per_usd: rate.tokens_out_per_usd,
        effective_from: rate.effective_from,
      });
      inserted += 1;
    }
  }
  return { inserted, skipped, files };
}

function defaultRatesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Production (bundled): rates/ sits next to bin.mjs.
  const bundled = path.join(here, 'rates');
  if (fs.existsSync(bundled)) return bundled;
  // Dev (TS sources): packages/core/rates/, walking up from src/budget/.
  return path.resolve(here, '..', '..', 'rates');
}
