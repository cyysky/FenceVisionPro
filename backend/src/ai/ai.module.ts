import { Module, Global } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { StorageModule } from '../storage/storage.module';

@Global()
@Module({
  imports: [StorageModule],
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
