import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
export declare const REQUIRED_PERMISSIONS = "required_permissions";
export declare const SUPER_ADMIN_ONLY = "super_admin_only";
export declare class PermissionsGuard implements CanActivate {
    private readonly reflector;
    constructor(reflector: Reflector);
    canActivate(context: ExecutionContext): boolean;
}
