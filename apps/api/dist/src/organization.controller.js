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
exports.OrganizationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const prisma_service_1 = require("./prisma.service");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const permissions_guard_1 = require("./permissions.guard");
const permissions_decorator_1 = require("./permissions.decorator");
class CreateDepartmentDto {
    name;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateDepartmentDto.prototype, "name", void 0);
class UpdateDepartmentDto {
    name;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateDepartmentDto.prototype, "name", void 0);
class SetActiveDto {
    active;
}
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SetActiveDto.prototype, "active", void 0);
class CreateBranchDto {
    name;
    address;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateBranchDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", Object)
], CreateBranchDto.prototype, "address", void 0);
class UpdateBranchDto {
    name;
    address;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateBranchDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", Object)
], UpdateBranchDto.prototype, "address", void 0);
let OrganizationController = class OrganizationController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    departments() {
        return this.prisma.department.findMany({
            include: { _count: { select: { employees: true } } },
            orderBy: { name: 'asc' }
        });
    }
    async createDepartment(dto, req) {
        const name = dto.name.trim();
        try {
            return await this.prisma.$transaction(async (tx) => {
                const item = await tx.department.create({ data: { name } });
                await tx.auditLog.create({
                    data: {
                        userId: req.user.sub,
                        action: 'DEPARTMENT_CREATED',
                        entityType: 'Department',
                        entityId: item.id,
                        afterJson: { name: item.name, active: item.active }
                    }
                });
                return item;
            });
        }
        catch (error) {
            if (error?.code === 'P2002')
                throw new common_1.BadRequestException('Ese departamento ya existe');
            throw error;
        }
    }
    async updateDepartment(id, dto, req) {
        const before = await this.prisma.department.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('Departamento no encontrado');
        try {
            return await this.prisma.$transaction(async (tx) => {
                const item = await tx.department.update({
                    where: { id },
                    data: { name: dto.name.trim() }
                });
                await tx.auditLog.create({
                    data: {
                        userId: req.user.sub,
                        action: 'DEPARTMENT_UPDATED',
                        entityType: 'Department',
                        entityId: id,
                        beforeJson: { name: before.name, active: before.active },
                        afterJson: { name: item.name, active: item.active }
                    }
                });
                return item;
            });
        }
        catch (error) {
            if (error?.code === 'P2002')
                throw new common_1.BadRequestException('Ya existe un departamento con ese nombre');
            throw error;
        }
    }
    async setDepartmentStatus(id, dto, req) {
        const before = await this.prisma.department.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('Departamento no encontrado');
        return this.prisma.$transaction(async (tx) => {
            const item = await tx.department.update({
                where: { id },
                data: { active: dto.active }
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub,
                    action: dto.active ? 'DEPARTMENT_ACTIVATED' : 'DEPARTMENT_DEACTIVATED',
                    entityType: 'Department',
                    entityId: id,
                    beforeJson: { active: before.active },
                    afterJson: { active: item.active }
                }
            });
            return {
                message: dto.active
                    ? 'Departamento reactivado; se conserva su historial'
                    : 'Departamento desactivado; se conservan sus relaciones e historial',
                department: item
            };
        });
    }
    branches() {
        return this.prisma.branch.findMany({
            include: { _count: { select: { employees: true } } },
            orderBy: { name: 'asc' }
        });
    }
    async createBranch(dto, req) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const item = await tx.branch.create({
                    data: {
                        name: dto.name.trim(),
                        address: dto.address?.trim() || null
                    }
                });
                await tx.auditLog.create({
                    data: {
                        userId: req.user.sub,
                        action: 'BRANCH_CREATED',
                        entityType: 'Branch',
                        entityId: item.id,
                        afterJson: {
                            name: item.name,
                            address: item.address,
                            active: item.active
                        }
                    }
                });
                return item;
            });
        }
        catch (error) {
            if (error?.code === 'P2002')
                throw new common_1.BadRequestException('Esa sucursal ya existe');
            throw error;
        }
    }
    async updateBranch(id, dto, req) {
        const before = await this.prisma.branch.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('Sucursal no encontrada');
        try {
            return await this.prisma.$transaction(async (tx) => {
                const item = await tx.branch.update({
                    where: { id },
                    data: {
                        name: dto.name.trim(),
                        address: dto.address?.trim() || null
                    }
                });
                await tx.auditLog.create({
                    data: {
                        userId: req.user.sub,
                        action: 'BRANCH_UPDATED',
                        entityType: 'Branch',
                        entityId: id,
                        beforeJson: {
                            name: before.name,
                            address: before.address,
                            active: before.active
                        },
                        afterJson: {
                            name: item.name,
                            address: item.address,
                            active: item.active
                        }
                    }
                });
                return item;
            });
        }
        catch (error) {
            if (error?.code === 'P2002')
                throw new common_1.BadRequestException('Ya existe una sucursal con ese nombre');
            throw error;
        }
    }
    async setBranchStatus(id, dto, req) {
        const before = await this.prisma.branch.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('Sucursal no encontrada');
        return this.prisma.$transaction(async (tx) => {
            const item = await tx.branch.update({
                where: { id },
                data: { active: dto.active }
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub,
                    action: dto.active ? 'BRANCH_ACTIVATED' : 'BRANCH_DEACTIVATED',
                    entityType: 'Branch',
                    entityId: id,
                    beforeJson: { active: before.active },
                    afterJson: { active: item.active }
                }
            });
            return {
                message: dto.active
                    ? 'Sucursal reactivada; se conserva su historial'
                    : 'Sucursal desactivada; se conservan sus relaciones e historial',
                branch: item
            };
        });
    }
};
exports.OrganizationController = OrganizationController;
__decorate([
    (0, common_1.Get)('departments'),
    (0, permissions_decorator_1.RequirePermissions)('employees.read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OrganizationController.prototype, "departments", null);
__decorate([
    (0, common_1.Post)('departments'),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateDepartmentDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizationController.prototype, "createDepartment", null);
__decorate([
    (0, common_1.Patch)('departments/:id'),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateDepartmentDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizationController.prototype, "updateDepartment", null);
__decorate([
    (0, common_1.Patch)('departments/:id/status'),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, SetActiveDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizationController.prototype, "setDepartmentStatus", null);
__decorate([
    (0, common_1.Get)('branches'),
    (0, permissions_decorator_1.RequirePermissions)('employees.read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OrganizationController.prototype, "branches", null);
__decorate([
    (0, common_1.Post)('branches'),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateBranchDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizationController.prototype, "createBranch", null);
__decorate([
    (0, common_1.Patch)('branches/:id'),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateBranchDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizationController.prototype, "updateBranch", null);
__decorate([
    (0, common_1.Patch)('branches/:id/status'),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, SetActiveDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizationController.prototype, "setBranchStatus", null);
exports.OrganizationController = OrganizationController = __decorate([
    (0, swagger_1.ApiTags)('organization'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrganizationController);
//# sourceMappingURL=organization.controller.js.map