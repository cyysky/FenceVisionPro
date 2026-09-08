import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

/** Demo accounts live on the yardex.local domain (see prisma/seed.ts). */
const DEMO_EMAIL_DOMAIN = '@yardex.local';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.session(user);
  }

  /**
   * Passwordless sign-in for the public demo accounts. Only active
   * users on the demo domain can use it; normal login stays intact.
   */
  async demoLogin(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive || !user.email.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN)) {
      throw new UnauthorizedException('Invalid demo account');
    }
    return this.session(user);
  }

  private session(user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    dealerId: string | null;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      dealerId: user.dealerId ?? null,
    };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        dealerId: user.dealerId,
      },
    };
  }

  async hashPassword(p: string) {
    return bcrypt.hash(p, 10);
  }
}
