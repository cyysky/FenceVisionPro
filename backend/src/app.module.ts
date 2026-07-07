import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DealersModule } from './dealers/dealers.module';
import { ProductsModule } from './products/products.module';
import { DesignsModule } from './designs/designs.module';
import { QuotesModule } from './quotes/quotes.module';
import { ProjectsModule } from './projects/projects.module';
import { InstallationsModule } from './installations/installations.module';
import { InstallersModule } from './installers/installers.module';
import { InvoicesModule } from './invoices/invoices.module';
import { RenderModule } from './render/render.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { AssetsModule } from './assets/assets.module';
import { PublicAiModule } from './public-ai/public-ai.module';
import { LoginThrottleMiddleware } from './auth/login-throttle.middleware';

const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    // Global throttle ceiling. Individual controllers apply their
    // own @Throttle({...}) for finer limits (e.g. the public
    // AI-generation submit endpoint uses 5/hour).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    DealersModule,
    ProductsModule,
    DesignsModule,
    QuotesModule,
    ProjectsModule,
    InstallationsModule,
    InstallersModule,
    InvoicesModule,
    RenderModule,
    StorageModule,
    AiModule,
    AssetsModule,
    PublicAiModule,
    ServeStaticModule.forRoot({
      rootPath: dataDir,
      serveRoot: '/static',
      // Exclude protected paths from the static middleware so the
      // auth-gated AssetsController can serve them instead. Other
      // /static/* paths (uploads, renders, overlays) stay public.
      exclude: ['/static/pdfs/(.*)', '/static/signatures/(.*)'],
      serveStaticOptions: { fallthrough: true },
    }),
  ],
  // The ThrottlerGuard is what actually enforces @Throttle({...})
  // decorators on controllers. Without registering it as APP_GUARD,
  // the decorators compile fine but silently do nothing at runtime
  // (the package doesn't auto-register). Verified live via hammer
  // test on 2026-07-07: 10 rapid submits all returned 201 with no
  // X-RateLimit-* headers before this guard was added.
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Throttle login attempts to slow down credential stuffing.
    // Applied only to /auth/login (not the whole app).
    consumer.apply(LoginThrottleMiddleware).forRoutes('auth/login');
  }
}
