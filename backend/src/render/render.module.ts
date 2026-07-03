import { Module } from '@nestjs/common';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [RenderController],
  providers: [RenderService],
  exports: [RenderService],
})
export class RenderModule {}
