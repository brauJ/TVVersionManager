import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { permissions: { include: { permission: true } } } });
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }
    const permissions = user.permissions.map(p => p.permission.code);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin, permissions },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );
    return { accessToken, user: { id: user.id, email: user.email, fullName: user.fullName, isSuperAdmin: user.isSuperAdmin, permissions } };
  }
}
