import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { WholesalersService } from './wholesalers.service';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '@prisma/client';

class CreateWholesalerDto {
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  // Slug is used in URLs so we restrict to URL-safe characters and
  // a length range. Same rules as the frontend uses.
  @IsString() @MinLength(2) @MaxLength(64) @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/) slug: string;
  @IsEmail() contactEmail: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsEmail() ownerEmail: string;
  @IsString() @MinLength(8) ownerPassword: string;
  @IsString() ownerName: string;
}

class AddStaffDto {
  @IsEmail() email: string;
  @IsString() fullName: string;
  @IsString() @MinLength(8) password: string;
}

class ResetStaffPasswordDto {
  @IsString() @MinLength(8) newPassword: string;
}

class UpdateWholesalerDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  // isActive toggles whether the wholesaler's users can log in
  // and whether the wholesaler shows up in the admin picker.
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('wholesalers')
export class WholesalersController {
  constructor(private svc: WholesalersService, private prisma: PrismaService, private auth: AuthService) {}

  @Roles(Role.ADMIN)
  @Get()
  list() { return this.svc.list(); }

  @Roles(Role.ADMIN, Role.WHOLESALER_OWNER, Role.WHOLESALER_STAFF)
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    // Admins can read any wholesaler. Owners/staff can only read
    // their own tenant. We don't 403 on a foreign id - that would
    // let an attacker enumerate valid tenant ids by status code.
    // Instead we silently return the caller's own tenant, which
    // matches what a UI navigating to /wholesalers/<id> expects.
    if (u.role !== Role.ADMIN && u.wholesalerId !== id) {
      return this.svc.get(u.wholesalerId!);
    }
    return this.svc.get(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateWholesalerDto) {
    return this.svc.create(dto);
  }

  /**
   * Admin-only update of a wholesaler's profile. Used to toggle
   * isActive (suspend a tenant without deleting their data),
   * correct a typo in the company name, or update the contact
   * email after a staff change. Wholesalers cannot update their
   * own profile yet - that lives in a future self-service page.
   */
  @Roles(Role.ADMIN)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateWholesalerDto) {
    const existing = await this.prisma.wholesaler.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Wholesaler not found');
    return this.prisma.wholesaler.update({ where: { id }, data: dto });
  }

  @Roles(Role.WHOLESALER_OWNER)
  @Post(':id/staff')
  addStaff(@Param('id') id: string, @Body() dto: AddStaffDto, @CurrentUser() u: JwtPayload) {
    if (u.role !== Role.ADMIN && u.wholesalerId !== id) {
      return this.svc.addStaff(u.wholesalerId!, dto.email, dto.fullName, dto.password);
    }
    return this.svc.addStaff(id, dto.email, dto.fullName, dto.password);
  }

  /**
   * Owner (or admin) resets a staff member's password. The staff
   * member is identified by their userId. This deliberately does
   * NOT require the old password - it's an admin action.
   */
  @Roles(Role.WHOLESALER_OWNER, Role.ADMIN)
  @Post(':id/staff/:staffId/reset-password')
  async resetStaffPassword(
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @Body() dto: ResetStaffPasswordDto,
    @CurrentUser() u: JwtPayload,
  ) {
    if (u.role !== Role.ADMIN && u.wholesalerId !== id) {
      throw new ForbiddenException('Cannot reset password for another wholesaler');
    }
    const staff = await this.prisma.user.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff user not found');
    if (staff.wholesalerId !== id) throw new ForbiddenException('Staff does not belong to this wholesaler');
    if (staff.role === Role.ADMIN) throw new ForbiddenException('Cannot reset an admin password via this endpoint');
    const newHash = await this.auth.hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: staffId }, data: { passwordHash: newHash } });
    return { ok: true };
  }

  /**
   * Owner (or admin) deactivates a staff member. The user row stays
   * (for audit trail / historical quote ownership) but login is
   * blocked and the JWT is effectively useless.
   */
  @Roles(Role.WHOLESALER_OWNER, Role.ADMIN)
  @Post(':id/staff/:staffId/deactivate')
  async deactivateStaff(@Param('id') id: string, @Param('staffId') staffId: string, @CurrentUser() u: JwtPayload) {
    if (u.role !== Role.ADMIN && u.wholesalerId !== id) {
      throw new ForbiddenException('Cannot deactivate a staff member of another wholesaler');
    }
    const staff = await this.prisma.user.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff user not found');
    if (staff.wholesalerId !== id) throw new ForbiddenException('Staff does not belong to this wholesaler');
    if (staff.role === Role.ADMIN) throw new ForbiddenException('Cannot deactivate an admin via this endpoint');
    await this.prisma.user.update({ where: { id: staffId }, data: { isActive: false } });
    return { ok: true, isActive: false };
  }

  @Roles(Role.WHOLESALER_OWNER, Role.ADMIN)
  @Post(':id/staff/:staffId/reactivate')
  async reactivateStaff(@Param('id') id: string, @Param('staffId') staffId: string, @CurrentUser() u: JwtPayload) {
    if (u.role !== Role.ADMIN && u.wholesalerId !== id) {
      throw new ForbiddenException('Cannot reactivate a staff member of another wholesaler');
    }
    const staff = await this.prisma.user.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff user not found');
    if (staff.wholesalerId !== id) throw new ForbiddenException('Staff does not belong to this wholesaler');
    await this.prisma.user.update({ where: { id: staffId }, data: { isActive: true } });
    return { ok: true, isActive: true };
  }
}
