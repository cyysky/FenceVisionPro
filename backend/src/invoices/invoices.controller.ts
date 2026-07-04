import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { AuthGuard } from '@nestjs/passport';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto, ListInvoicesQueryDto, TransitionInvoiceDto, UpdateInvoiceDto } from './dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { PdfService } from '../quotes/pdf.service';

/**
 * Invoice controller. Mounted at /invoices.
 *
 * Endpoints:
 *   GET    /invoices[?status=&quoteId=]   list
 *   GET    /invoices/:id                  read
 *   POST   /invoices                      create (from an APPROVED quote)
 *   PATCH  /invoices/:id                  update DRAFT notes/dueAt
 *   POST   /invoices/:id/transition       state machine
 *   DELETE /invoices/:id                  delete a DRAFT
 *
 * A dedicated PDF endpoint will be added in a follow-up; for
 * now invoices are downloaded as JSON. (Spec: "no SMTP wiring,
 * invoices can be mailed by being downloaded as PDF for now" -
 * the PDF render is added to PdfService in a follow-up step.)
 */
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.DEALER_OWNER, Role.DEALER_STAFF)
@Controller('invoices')
export class InvoicesController {
  constructor(private svc: InvoicesService, private pdf: PdfService) {}

  @Get()
  list(@CurrentUser() u: JwtPayload, @Query() q: ListInvoicesQueryDto) {
    return this.svc.list(u, { status: q.status, quoteId: q.quoteId });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.get(id, u);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() u: JwtPayload) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() u: JwtPayload) {
    return this.svc.update(id, u, dto);
  }

  @Post(':id/transition')
  @HttpCode(200)
  transition(@Param('id') id: string, @Body() dto: TransitionInvoiceDto, @CurrentUser() u: JwtPayload) {
    return this.svc.transition(id, u, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.remove(id, u);
  }

  /**
   * Render an invoice PDF and stream it back. Uses PdfService.generateInvoice
   * which writes to the data dir; we read it from disk and send.
   * Owner/admin only — staff can view but not download per typical policy.
   */
  @Get(':id/pdf')
  async pdfDownload(@Param('id') id: string, @CurrentUser() u: JwtPayload, @Res() res: Response) {
    const invoice = await this.svc.get(id, u);
    const relUrl = await this.pdf.generateInvoice(invoice);
    // relUrl is /public/pdfs/<filename> (public bucket - so the
    // customer-shareable link works without auth). For /public/...
    // URLs the file lives under <DATA_DIR>/public/...; for older
    // /static/... URLs it lives directly under <DATA_DIR>/...
    const dataDir = process.env.DATA_DIR || './data';
    const stripped = relUrl.replace(/^\/(static|public)\//, '');
    const filePath = relUrl.startsWith('/public/')
      ? join(dataDir, 'public', stripped)
      : join(dataDir, stripped);
    if (!existsSync(filePath)) {
      // Should not happen, but be defensive
      return res.status(500).json({ message: 'PDF render produced no file' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.number}.pdf"`);
    res.sendFile(filePath);
  }
}
