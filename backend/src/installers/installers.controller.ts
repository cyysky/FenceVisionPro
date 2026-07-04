import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsOptional } from 'class-validator';
import { InstallersService } from './installers.service';
import { CreateInstallerDto, UpdateInstallerDto } from './dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../common/guards/roles.guard';

class ListInstallersQueryDto {
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

/**
 * Installer directory controller.
 *
 * Mounted at /installers (no global prefix; see main.ts note).
 * All routes require a JWT; admin sees all tenants, dealer users
 * are scoped to their own tenant inside the service.
 */
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.DEALER_OWNER, Role.DEALER_STAFF)
@Controller('installers')
export class InstallersController {
  constructor(private svc: InstallersService) {}

  @Get()
  list(@CurrentUser() u: JwtPayload, @Query() q: ListInstallersQueryDto) {
    return this.svc.list(u, { status: q.status });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.get(id, u);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateInstallerDto, @CurrentUser() u: JwtPayload) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInstallerDto, @CurrentUser() u: JwtPayload) {
    return this.svc.update(id, u, dto);
  }

  /**
   * Soft delete: flips status to INACTIVE. The row is preserved
   * so any historical Installation still has a valid FK target.
   */
  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.softDelete(id, u);
  }
}
