import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WholesalersModule } from './wholesalers/wholesalers.module';
import { ProductsModule } from './products/products.module';
import { DesignsModule } from './designs/designs.module';
import { QuotesModule } from './quotes/quotes.module';
import { RenderModule } from './render/render.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { AssetsModule } from './assets/assets.module';
import { LoginThrottleMiddleware } from './auth/login-throttle.middleware';

const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    PrismaModule,
    AuthModule,
    WholesalersModule,
    ProductsModule,
    DesignsModule,
    QuotesModule,
    RenderModule,
    StorageModule,
    AiModule,
    AssetsModule,
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
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Throttle login attempts to slow down credential stuffing.
    // Applied only to /auth/login (not the whole app).
    consumer.apply(LoginThrottleMiddleware).forRoutes('auth/login');
  }
}
