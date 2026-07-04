import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { PublicAssetsController } from './public-assets.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AssetsController, PublicAssetsController],
})
export class AssetsModule {}
