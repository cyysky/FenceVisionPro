import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DesignsService } from './designs.service';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../common/guards/roles.guard';

class CreateDesignDto {
  @IsString() name: string;
  @IsString() style: string;
  @IsOptional() @IsString() description?: string;
  @IsString() overlayUrl: string;
  @IsOptional() config?: any;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() productIds?: string[];
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('designs')
export class DesignsController {
  constructor(private svc: DesignsService) {}

  // GET stays open to any authenticated user: the dealer
  // picker on the new-quote page needs to list designs.
  @Get() list() { return this.svc.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }

  // POST is admin-only: only Yardex staff can add to the
  // global design library that every dealer sees.
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateDesignDto) {
    const { productIds, ...rest } = dto;
    return this.svc.create({
      ...rest,
      config: rest.config || {},
      designProducts: productIds
        ? { create: productIds.map(productId => ({ productId, coverage: 2.4 })) }
        : undefined,
    });
  }
}
