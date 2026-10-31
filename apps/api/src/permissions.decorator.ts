import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PERMISSIONS, SUPER_ADMIN_ONLY } from './permissions.guard';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_ONLY, true);
