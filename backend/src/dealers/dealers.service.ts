import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '@prisma/client';

@Injectable()
export class DealersService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  list() {
    return this.prisma.dealer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const w = await this.prisma.dealer.findUnique({
      where: { id },
      include: { users: { select: { id: true, email: true, fullName: true, role: true } } },
    });
    if (!w) throw new NotFoundException('Dealer not found');
    return w;
  }

  async create(data: { name: string; slug: string; contactEmail: string; contactPhone?: string; ownerEmail: string; ownerPassword: string; ownerName: string }) {
    const exists = await this.prisma.dealer.findUnique({ where: { slug: data.slug } });
    if (exists) throw new ConflictException('Slug already in use');
    const w = await this.prisma.dealer.create({
      data: {
        name: data.name,
        slug: data.slug,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
      },
    });
    const owner = await this.prisma.user.create({
      data: {
        email: data.ownerEmail.toLowerCase(),
        passwordHash: await this.auth.hashPassword(data.ownerPassword),
        fullName: data.ownerName,
        role: Role.DEALER_OWNER,
        dealerId: w.id,
      },
    });
    return { dealer: w, owner: { id: owner.id, email: owner.email, fullName: owner.fullName } };
  }

  async addStaff(dealerId: string, email: string, fullName: string, password: string) {
    const exists = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) throw new ConflictException('Email already registered');
    const u = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        fullName,
        passwordHash: await this.auth.hashPassword(password),
        role: Role.DEALER_STAFF,
        dealerId,
      },
    });
    return { id: u.id, email: u.email, fullName: u.fullName, role: u.role };
  }
}
