import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { AdminLeadsService } from './admin-leads.service';

class MarkContactedDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * Admin-only lead management. All routes require a valid JWT and
 * scope results to the calling dealer's convertedQuote (admins see
 * everything). Mounted under `/admin/leads` per the public spec.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('admin/leads')
export class AdminLeadsController {
  constructor(private svc: AdminLeadsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.list(user.dealerId, user.role === 'ADMIN', { status, from, to, page: Number(page), pageSize: Number(pageSize) });
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.get(id, user.dealerId, user.role === 'ADMIN');
  }

  @Post(':id/convert-to-quote')
  convert(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.convertToQuote(id, user.dealerId, user.role === 'ADMIN', user.sub);
  }

  @Post(':id/mark-contacted')
  contacted(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: MarkContactedDto,
  ) {
    return this.svc.markContacted(id, user.dealerId, user.role === 'ADMIN', user.sub, dto.notes);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.archive(id, user.dealerId, user.role === 'ADMIN');
  }
}
