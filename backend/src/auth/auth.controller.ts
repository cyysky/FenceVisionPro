import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { recordFailureFromReq, clearFromReq } from './login-throttle.middleware';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(6) oldPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private prisma: PrismaService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: any) {
    // The IP was already recorded by LoginThrottleMiddleware; we
    // just need to mark success/failure. On any thrown error
    // (including 401 from bad credentials) record a failure;
    // on success clear the counter.
    try {
      const out = await this.auth.login(dto.email, dto.password);
      clearFromReq(req);
      return out;
    } catch (e) {
      recordFailureFromReq(req);
      throw e;
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  /**
   * Change the calling user's own password. Requires the current
   * password as proof. Bcrypt cost 10. Inactive users cannot use
   * this even with a valid token.
   */
  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  async changePassword(@CurrentUser() u: JwtPayload, @Body() dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: u.sub } });
    if (!user || !user.isActive) throw new ForbiddenException('User not found or inactive');
    const ok = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!ok) throw new ForbiddenException('Current password is incorrect');
    const newHash = await this.auth.hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: u.sub }, data: { passwordHash: newHash } });
    return { ok: true };
  }
}
