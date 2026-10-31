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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const argon2 = require("argon2");
const prisma_service_1 = require("./prisma.service");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const permissions_guard_1 = require("./permissions.guard");
const permissions_decorator_1 = require("./permissions.decorator");
class CreateUserDto {
    email;
    password;
    fullName;
    permissionCodes;
}
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], CreateUserDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(12),
    __metadata("design:type", String)
], CreateUserDto.prototype, "password", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], CreateUserDto.prototype, "fullName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateUserDto.prototype, "permissionCodes", void 0);
class UpdateUserDto {
    email;
    fullName;
    password;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "fullName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(12),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "password", void 0);
class UpdateStatusDto {
    status;
}
__decorate([
    (0, class_validator_1.IsIn)(['ACTIVE', 'DISABLED']),
    __metadata("design:type", String)
], UpdateStatusDto.prototype, "status", void 0);
class UpdatePermissionsDto {
    permissionCodes;
}
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdatePermissionsDto.prototype, "permissionCodes", void 0);
let UsersController = class UsersController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list() {
        const users = await this.prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, email: true, fullName: true, status: true,
                isSuperAdmin: true, createdAt: true, updatedAt: true,
                permissions: { select: { permission: { select: { code: true, description: true } } } },
            },
        });
        return users.map((user) => ({
            ...user,
            permissions: user.permissions.map((item) => item.permission),
        }));
    }
    listPermissions() {
        return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
    }
    async create(dto, req) {
        const email = dto.email.trim().toLowerCase();
        const permissionCodes = dto.permissionCodes ?? [];
        const permissions = await this.resolvePermissions(permissionCodes);
        const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
        try {
            return await this.prisma.$transaction(async (tx) => {
                const user = await tx.user.create({
                    data: {
                        email,
                        fullName: dto.fullName.trim(),
                        passwordHash,
                        isSuperAdmin: false,
                        permissions: permissions.length
                            ? { create: permissions.map((permission) => ({ permissionId: permission.id })) }
                            : undefined,
                    },
                    select: {
                        id: true, email: true, fullName: true, status: true,
                        isSuperAdmin: true, createdAt: true,
                    },
                });
                await tx.auditLog.create({
                    data: {
                        userId: req.user.sub,
                        action: 'ADMIN_USER_CREATED',
                        entityType: 'User',
                        entityId: user.id,
                        afterJson: { email: user.email, fullName: user.fullName, permissionCodes },
                    },
                });
                return { ...user, permissions: permissionCodes };
            });
        }
        catch (error) {
            if (error?.code === 'P2002')
                throw new common_1.ConflictException('Ya existe un usuario con ese correo');
            throw error;
        }
    }
    async update(id, dto, req) {
        const before = await this.prisma.user.findUnique({
            where: { id },
            select: { id: true, email: true, fullName: true, isSuperAdmin: true },
        });
        if (!before)
            throw new common_1.NotFoundException('Usuario no encontrado');
        const data = {};
        if (dto.email !== undefined)
            data.email = dto.email.trim().toLowerCase();
        if (dto.fullName !== undefined)
            data.fullName = dto.fullName.trim();
        if (dto.password !== undefined)
            data.passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
        try {
            return await this.prisma.$transaction(async (tx) => {
                const updated = await tx.user.update({
                    where: { id }, data,
                    select: { id: true, email: true, fullName: true, status: true, isSuperAdmin: true, updatedAt: true },
                });
                await tx.auditLog.create({
                    data: {
                        userId: req.user.sub,
                        action: 'ADMIN_USER_UPDATED',
                        entityType: 'User', entityId: id,
                        beforeJson: { email: before.email, fullName: before.fullName },
                        afterJson: { email: updated.email, fullName: updated.fullName, passwordChanged: dto.password !== undefined },
                    },
                });
                return updated;
            });
        }
        catch (error) {
            if (error?.code === 'P2002')
                throw new common_1.ConflictException('Ya existe un usuario con ese correo');
            throw error;
        }
    }
    async updateStatus(id, dto, req) {
        if (id === req.user.sub && dto.status === 'DISABLED') {
            throw new common_1.BadRequestException('No puedes desactivar tu propia cuenta');
        }
        const before = await this.prisma.user.findUnique({
            where: { id }, select: { id: true, status: true, isSuperAdmin: true },
        });
        if (!before)
            throw new common_1.NotFoundException('Usuario no encontrado');
        if (before.isSuperAdmin && dto.status === 'DISABLED') {
            const activeSuperAdmins = await this.prisma.user.count({
                where: { isSuperAdmin: true, status: 'ACTIVE' },
            });
            if (activeSuperAdmins <= 1)
                throw new common_1.BadRequestException('No puedes desactivar al último superadministrador activo');
        }
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
                where: { id }, data: { status: dto.status },
                select: { id: true, email: true, fullName: true, status: true, isSuperAdmin: true },
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub, action: dto.status === 'DISABLED' ? 'ADMIN_USER_DISABLED' : 'ADMIN_USER_ENABLED',
                    entityType: 'User', entityId: id,
                    beforeJson: { status: before.status }, afterJson: { status: updated.status },
                },
            });
            return updated;
        });
    }
    async updatePermissions(id, dto, req) {
        const target = await this.prisma.user.findUnique({
            where: { id }, select: { id: true, email: true, isSuperAdmin: true },
        });
        if (!target)
            throw new common_1.NotFoundException('Usuario no encontrado');
        const before = await this.prisma.userPermission.findMany({
            where: { userId: id }, select: { permission: { select: { code: true } } },
        });
        const permissions = await this.resolvePermissions(dto.permissionCodes);
        return this.prisma.$transaction(async (tx) => {
            await tx.userPermission.deleteMany({ where: { userId: id } });
            if (permissions.length) {
                await tx.userPermission.createMany({
                    data: permissions.map((permission) => ({ userId: id, permissionId: permission.id })),
                });
            }
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub, action: 'ADMIN_USER_PERMISSIONS_UPDATED',
                    entityType: 'User', entityId: id,
                    beforeJson: { permissionCodes: before.map((item) => item.permission.code) },
                    afterJson: { permissionCodes: dto.permissionCodes },
                },
            });
            return { userId: id, email: target.email, permissions: dto.permissionCodes };
        });
    }
    async resolvePermissions(codes) {
        const uniqueCodes = [...new Set(codes)];
        const permissions = uniqueCodes.length
            ? await this.prisma.permission.findMany({ where: { code: { in: uniqueCodes } } })
            : [];
        if (permissions.length !== uniqueCodes.length) {
            const found = new Set(permissions.map((permission) => permission.code));
            const missing = uniqueCodes.filter((code) => !found.has(code));
            throw new common_1.BadRequestException(`Permisos desconocidos: ${missing.join(', ')}`);
        }
        return permissions;
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('permissions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "listPermissions", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateUserDto, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateUserDto, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateStatusDto, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)(':id/permissions'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdatePermissionsDto, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updatePermissions", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('users'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.SuperAdminOnly)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersController);
//# sourceMappingURL=users.controller.js.map