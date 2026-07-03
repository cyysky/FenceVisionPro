import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AssetsController],
})
export class AssetsModule {}
