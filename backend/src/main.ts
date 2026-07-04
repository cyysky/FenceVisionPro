import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { mkdirSync } from 'fs';


function validateEnv() {
  // Refuse to boot with the well-known dev defaults from .env.example.
  // NODE_ENV is hardcoded to 'production' in the Dockerfile, so we
  // use a different signal: a known dev placeholder secret.
  // Set YARDEX_ALLOW_DEV_SECRET=1 to bypass this check (e.g. local demo).
  const secret = process.env.JWT_SECRET || '';
  const placeholderSecrets = new Set(['', 'change-me-in-production', 'dev-only-change-me']);
  if (placeholderSecrets.has(secret) && process.env.YARDEX_ALLOW_DEV_SECRET !== '1') {
    if (process.env.YARDEX_STRICT_ENV === '1') {
      throw new Error('Refusing to start: JWT_SECRET is the .env.example placeholder. Set a strong JWT_SECRET in backend/.env (or set YARDEX_ALLOW_DEV_SECRET=1 for local dev).');
    }
    console.warn('[startup] WARNING: JWT_SECRET is the .env.example placeholder. Set a strong value, or set YARDEX_ALLOW_DEV_SECRET=1 to silence this.');
  }
  if (process.env.AI_ENABLED === 'true') {
    if (!process.env.AI_BASE_URL) console.warn('[startup] WARNING: AI_ENABLED=true but AI_BASE_URL is empty. AI calls will fail.');
    if (!process.env.AI_API_KEY) console.warn('[startup] WARNING: AI_ENABLED=true but AI_API_KEY is empty. AI calls will fail.');
  }
}

validateEnv();
async function bootstrap() {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
  process.env.DATA_DIR = dataDir;
  mkdirSync(join(dataDir, 'uploads'), { recursive: true });
  mkdirSync(join(dataDir, 'renders'), { recursive: true });
  mkdirSync(join(dataDir, 'pdfs'), { recursive: true });

  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));


  // Periodic expiry sweep: any SENT quote whose validUntil has
  // passed is auto-marked EXPIRED. This keeps the public approval
  // link in sync with the wholesaler's validUntil. The interval is
  // configurable via QUOTE_EXPIRY_SWEEP_MS (default 5 min) and can
  // be disabled by setting it to 0.
  try {
    const quotesService = app.get(require('./quotes/quotes.service').QuotesService);
    const intervalMs = Number(process.env.QUOTE_EXPIRY_SWEEP_MS || 5 * 60 * 1000);
    if (intervalMs > 0) {
      const tick = async () => {
        try {
          const n = await quotesService.expireOverdue();
          if (n > 0) Logger.log(`Expired ${n} overdue quote(s)`, 'ExpirySweep');
        } catch (e: any) {
          Logger.warn(`Expiry sweep failed: ${e?.message}`, 'ExpirySweep');
        }
      };
      // Run once at boot, then on the interval
      tick();
      setInterval(tick, intervalMs);
      Logger.log(`Quote expiry sweep every ${intervalMs / 1000}s`, 'Bootstrap');
    }
  } catch (e: any) {
    Logger.warn(`Could not start expiry sweep: ${e?.message}`, 'Bootstrap');
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`Yardex API listening on :${port}`, 'Bootstrap');
}
bootstrap();

