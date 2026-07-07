import { Module } from '@nestjs/common';
import { PublicAiController } from './public-ai.controller';
import { PublicAiService } from './public-ai.service';
import { AdminLeadsController } from './admin-leads.controller';
import { AdminLeadsService } from './admin-leads.service';
import { StorageModule } from '../storage/storage.module';
import { QuotesModule } from '../quotes/quotes.module';

/**
 * Public AI Yard Visualizer + admin lead management.
 *
 * PublicAiController is unauthenticated (rate-limited at the route
 * level). AdminLeadsController sits behind JWT via @UseGuards on
 * the controller class.
 *
 * AdminLeadsService depends on QuotesService for the
 * convert-to-quote path - that's why QuotesModule is in the
 * imports array (QuotesService is exported).
 */
@Module({
  imports: [StorageModule, QuotesModule],
  controllers: [PublicAiController, AdminLeadsController],
  providers: [PublicAiService, AdminLeadsService],
  exports: [PublicAiService, AdminLeadsService],
})
export class PublicAiModule {}
