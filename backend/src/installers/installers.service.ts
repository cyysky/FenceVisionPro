import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

/**
 * Installer directory service.
 *
 * Owns the protected (dealer + admin) CRUD for the Installer
 * model. The "soft delete" is just a status flip to INACTIVE
 * (see DELETE handler) so the historical Installation rows still
 * have a sensible FK to follow.
 *
 * Scoping:
 *   - ADMIN sees every installer.
 *   - DEALER_OWNER / DEALER_STAFF see and may only mutate the
 *     installers that belong to their own tenant.
 *
 * Cross-tenant access is masked as a 404 (not 403) so an attacker
 * cannot enumerate installer ids by status code.
 */
@Injectable()
export class InstallersService {
  constructor(private prisma: PrismaService) {}

  private authCtx(u: JwtPayload) {
    const isAdmin = u.role === Role.ADMIN;
    return { dealerId: u.dealerId, isAdmin };
  }

  async list(u: JwtPayload, opts: { status?: 'ACTIVE' | 'INACTIVE' } = {}) {
    const { dealerId, isAdmin } = this.authCtx(u);
    const where: any = isAdmin ? {} : { dealerId: dealerId! };
    if (opts.status) where.status = opts.status;
    return this.prisma.installer.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { installations: true } } },
    });
  }

  async get(id: string, u: JwtPayload) {
    const { dealerId, isAdmin } = this.authCtx(u);
    const installer = await this.prisma.installer.findUnique({
      where: { id },
      include: { _count: { select: { installations: true } } },
    });
    if (!installer) throw new NotFoundException('Installer not found');
    if (!isAdmin && installer.dealerId !== dealerId) {
      // Mask as 404 to avoid leaking cross-tenant ids.
      throw new NotFoundException('Installer not found');
    }
    return installer;
  }

  async create(u: JwtPayload, dto: {
    name: string; phone?: string; email?: string;
    companyName?: string; notes?: string; status?: 'ACTIVE' | 'INACTIVE';
    dealerId?: string;
  }) {
    const { dealerId: callerDealerId, isAdmin } = this.authCtx(u);
    // Resolve the target dealer. Dealer users are pinned to
    // their own tenant (dealerId in the body is ignored for
    // them). Admins must supply a dealerId in the body, or
    // they get a 400 - we never auto-default to "the first
    // dealer" or "null" because both are silently wrong.
    let targetDealerId: string;
    if (isAdmin) {
      if (!dto.dealerId) {
        throw new ForbiddenException('Admin must specify dealerId when creating an installer');
      }
      const d = await this.prisma.dealer.findUnique({ where: { id: dto.dealerId } });
      if (!d) throw new NotFoundException('Dealer not found');
      targetDealerId = d.id;
    } else {
      if (!callerDealerId) {
        throw new ForbiddenException('Only dealer users can create installers');
      }
      targetDealerId = callerDealerId;
    }
    return this.prisma.installer.create({
      data: {
        dealerId: targetDealerId,
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        companyName: dto.companyName ?? null,
        notes: dto.notes ?? null,
        status: dto.status ?? 'ACTIVE',
      },
    });
  }

  async update(id: string, u: JwtPayload, dto: {
    name?: string; phone?: string; email?: string;
    companyName?: string; notes?: string; status?: 'ACTIVE' | 'INACTIVE';
  }) {
    const existing = await this.get(id, u);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.companyName !== undefined) data.companyName = dto.companyName || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    if (dto.status !== undefined) data.status = dto.status;
    return this.prisma.installer.update({ where: { id: existing.id }, data });
  }

  /**
   * Soft delete: flip to INACTIVE rather than dropping the row.
   * Historical Installations still want a sensible FK target
   * even after the dealer stops using the contractor.
   */
  async softDelete(id: string, u: JwtPayload) {
    const existing = await this.get(id, u);
    if (existing.status === 'INACTIVE') return existing;
    return this.prisma.installer.update({
      where: { id: existing.id },
      data: { status: 'INACTIVE' },
    });
  }
}
