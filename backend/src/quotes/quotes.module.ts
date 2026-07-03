import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { PublicQuotesController } from './public-quotes.controller';
import { PdfService } from './pdf.service';
import { RenderModule } from '../render/render.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [RenderModule, StorageModule],
  controllers: [QuotesController, PublicQuotesController],
  providers: [QuotesService, PdfService],
  exports: [QuotesService, PdfService],
})
export class QuotesModule {}
