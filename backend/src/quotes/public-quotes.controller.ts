import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { IsOptional, IsString, MaxLength } from 'class-validator';

class ApproveDto {
  @IsString() signatureDataUrl: string;
}

class RejectDto {
  // Optional free-text reason. Recorded on the quote (wholesaler-visible only)
  // but never exposed on the public read.
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

/**
 * Public endpoints for the customer approval link.
 * No auth required - link security comes from UUID randomness.
 */
@Controller('public/quotes')
export class PublicQuotesController {
  constructor(private svc: QuotesService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getPublic(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveDto) {
    return this.svc.approvePublic(id, dto.signatureDataUrl);
  }

  /**
   * Customer declines the quote. The status becomes REJECTED so
   * the wholesaler knows to follow up. We deliberately do NOT
   * require any signature or reason - the customer is rejecting,
   * not agreeing to anything.
   */
  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.svc.rejectPublic(id, dto.reason);
  }
}
