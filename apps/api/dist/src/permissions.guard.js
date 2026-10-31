"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionsGuard = exports.SUPER_ADMIN_ONLY = exports.REQUIRED_PERMISSIONS = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
exports.REQUIRED_PERMISSIONS = 'required_permissions';
exports.SUPER_ADMIN_ONLY = 'super_admin_only';
let PermissionsGuard = class PermissionsGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user?.sub)
            throw new common_1.ForbiddenException('Usuario no autenticado');
        const superAdminOnly = this.reflector.getAllAndOverride(exports.SUPER_ADMIN_ONLY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (superAdminOnly) {
            if (!user.isSuperAdmin)
                throw new common_1.ForbiddenException('Solo el superadministrador puede realizar esta acción');
            return true;
        }
        const required = this.reflector.getAllAndOverride(exports.REQUIRED_PERMISSIONS, [
            context.getHandler(),
            context.getClass(),
        ]) ?? [];
        if (user.isSuperAdmin)
            return true;
        const granted = Array.isArray(user.permissions) ? user.permissions : [];
        const missing = required.filter((permission) => !granted.includes(permission));
        if (missing.length)
            throw new common_1.ForbiddenException('No tienes permisos para realizar esta acción');
        return true;
    }
};
exports.PermissionsGuard = PermissionsGuard;
exports.PermissionsGuard = PermissionsGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], PermissionsGuard);
//# sourceMappingURL=permissions.guard.js.map