import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const REQUIRED_PERMISSIONS = 'required_permissions';
export const SUPER_ADMIN_ONLY = 'super_admin_only';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.sub) throw new ForbiddenException('Usuario no autenticado');

    const superAdminOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_ONLY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (superAdminOnly) {
      if (!user.isSuperAdmin) throw new ForbiddenException('Solo el superadministrador puede realizar esta acción');
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    if (user.isSuperAdmin) return true;
    const granted: string[] = Array.isArray(user.permissions) ? user.permissions : [];
    const missing = required.filter((permission) => !granted.includes(permission));
    if (missing.length) throw new ForbiddenException('No tienes permisos para realizar esta acción');
    return true;
  }
}
