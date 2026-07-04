import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

/**
 * Invoicing module.
 *
 * The service is self-contained — quotes + dealers are read via
 * Prisma directly, no other module needs to consume this one.
 */
@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
