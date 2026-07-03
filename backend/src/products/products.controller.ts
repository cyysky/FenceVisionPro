import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { Role } from '@prisma/client';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

class CreateProductDto {
  @IsString() sku: string;
  @IsString() name: string;
  @IsString() category: string;
  @IsOptional() @IsString() description?: string;
  @IsString() unit: string;
  @IsNumber() @Min(0) @Max(1000000) basePrice: number;
  @IsArray() heightOptions: string[];
  @IsArray() colorOptions: string[];
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class SetOverrideDto {
  // Overrides must be non-negative and within a sane range. A price
  // override of -5 or 1e9 is almost certainly a bug (or an attack).
  @IsNumber() @Min(0) @Max(1000000) price: number;
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private svc: ProductsService) {}

  @Get()
  list(@CurrentUser() u: JwtPayload) {
    return this.svc.listForWholesaler(u.role === Role.ADMIN ? null : u.wholesalerId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.get(id, u.role === Role.ADMIN ? null : u.wholesalerId);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.svc.create(dto);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.svc.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Post(':id/override/:wholesalerId')
  setOverride(@Param('id') id: string, @Param('wholesalerId') wholesalerId: string, @Body() dto: SetOverrideDto) {
    return this.svc.setOverride(wholesalerId, id, dto.price);
  }

  @Roles(Role.ADMIN)
  @Delete(':id/override/:wholesalerId')
  clearOverride(@Param('id') id: string, @Param('wholesalerId') wholesalerId: string) {
    return this.svc.clearOverride(wholesalerId, id);
  }
}
