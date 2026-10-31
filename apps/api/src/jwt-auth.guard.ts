import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Se requiere autenticación');
    }

    const token = authorization.slice(7).trim();
    if (!token) throw new UnauthorizedException('Token no válido');

    try {
      const claims = await this.jwtService.verifyAsync<{ sub?: string }>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      if (!claims.sub) throw new UnauthorizedException('Token sin usuario válido');

      // La base de datos es la fuente actual de estado y permisos; no se confía
      // en los permisos antiguos que puedan seguir dentro del JWT.
      const user = await this.prisma.user.findUnique({
        where: { id: claims.sub },
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          isSuperAdmin: true,
          permissions: { include: { permission: true } },
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('La cuenta está desactivada o ya no existe');
      }

      request.user = {
        sub: user.id,
        email: user.email,
        fullName: user.fullName,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions.map((item) => item.permission.code),
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Token inválido o vencido');
    }
  }
}
