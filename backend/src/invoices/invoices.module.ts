import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { QuotesModule } from '../quotes/quotes.module';

/**
 * Invoicing module.
 *
 * The service is self-contained — quotes + dealers are read via
 * Prisma directly. We import QuotesModule only to get PdfService
 * for the /invoices/:id/pdf endpoint.
 */
@Module({
  imports: [QuotesModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
