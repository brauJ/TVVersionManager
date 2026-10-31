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
exports.EmployeesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("./prisma.service");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const permissions_guard_1 = require("./permissions.guard");
const permissions_decorator_1 = require("./permissions.decorator");
class CreateEmployeeDto {
    rut;
    firstName;
    lastName;
    position;
    departmentId;
    branchId;
    hiredAt;
    status;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    __metadata("design:type", String)
], CreateEmployeeDto.prototype, "rut", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    __metadata("design:type", String)
], CreateEmployeeDto.prototype, "firstName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    __metadata("design:type", String)
], CreateEmployeeDto.prototype, "lastName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], CreateEmployeeDto.prototype, "position", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], CreateEmployeeDto.prototype, "departmentId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], CreateEmployeeDto.prototype, "branchId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Object)
], CreateEmployeeDto.prototype, "hiredAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.EmployeeStatus),
    __metadata("design:type", String)
], CreateEmployeeDto.prototype, "status", void 0);
class UpdateEmployeeDto {
    rut;
    firstName;
    lastName;
    position;
    departmentId;
    branchId;
    hiredAt;
    status;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    __metadata("design:type", String)
], UpdateEmployeeDto.prototype, "rut", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    __metadata("design:type", String)
], UpdateEmployeeDto.prototype, "firstName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    __metadata("design:type", String)
], UpdateEmployeeDto.prototype, "lastName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], UpdateEmployeeDto.prototype, "position", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], UpdateEmployeeDto.prototype, "departmentId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], UpdateEmployeeDto.prototype, "branchId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Object)
], UpdateEmployeeDto.prototype, "hiredAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.EmployeeStatus),
    __metadata("design:type", String)
], UpdateEmployeeDto.prototype, "status", void 0);
let EmployeesController = class EmployeesController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async validateActiveAssignments(departmentId, branchId) {
        if (departmentId) {
            const department = await this.prisma.department.findUnique({
                where: { id: departmentId },
                select: { id: true, active: true }
            });
            if (!department) {
                throw new common_1.BadRequestException('El departamento seleccionado no existe');
            }
            if (!department.active) {
                throw new common_1.BadRequestException('No se puede asignar un trabajador a un departamento inactivo');
            }
        }
        if (branchId) {
            const branch = await this.prisma.branch.findUnique({
                where: { id: branchId },
                select: { id: true, active: true }
            });
            if (!branch) {
                throw new common_1.BadRequestException('La sucursal seleccionada no existe');
            }
            if (!branch.active) {
                throw new common_1.BadRequestException('No se puede asignar un trabajador a una sucursal inactiva');
            }
        }
    }
    list(q, status) {
        return this.prisma.employee.findMany({
            where: {
                ...(q ? {
                    OR: [
                        { rut: { contains: q } },
                        { firstName: { contains: q } },
                        { lastName: { contains: q } }
                    ]
                } : {}),
                ...(status === 'ACTIVE' || status === 'INACTIVE'
                    ? { status: status } : {})
            },
            include: { department: true, branch: true },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            take: 200
        });
    }
    async getOne(id) {
        const employee = await this.prisma.employee.findUnique({
            where: { id },
            include: {
                department: true,
                branch: true,
                shiftAssignments: {
                    include: { shift: true },
                    orderBy: { validFrom: 'desc' }
                }
            }
        });
        if (!employee)
            throw new common_1.NotFoundException('Trabajador no encontrado');
        return employee;
    }
    async create(dto, req) {
        try {
            await this.validateActiveAssignments(dto.departmentId, dto.branchId);
            const data = {
                rut: dto.rut.trim(),
                firstName: dto.firstName.trim(),
                lastName: dto.lastName.trim(),
                position: dto.position?.trim() || null,
                departmentId: dto.departmentId || null,
                branchId: dto.branchId || null,
                hiredAt: dto.hiredAt ? new Date(dto.hiredAt) : null,
                ...(dto.status ? { status: dto.status } : {})
            };
            return await this.prisma.$transaction(async (tx) => {
                const employee = await tx.employee.create({ data });
                await tx.auditLog.create({
                    data: {
                        userId: req.user.sub,
                        action: 'EMPLOYEE_CREATED',
                        entityType: 'Employee',
                        entityId: employee.id,
                        afterJson: {
                            rut: employee.rut,
                            firstName: employee.firstName,
                            lastName: employee.lastName,
                            status: employee.status
                        }
                    }
                });
                return employee;
            });
        }
        catch (error) {
            if (error?.status)
                throw error;
            if (error?.code === 'P2002') {
                throw new common_1.BadRequestException('Ya existe un trabajador con ese RUT');
            }
            if (error?.code === 'P2003') {
                throw new common_1.BadRequestException('El departamento o la sucursal seleccionados no existen');
            }
            throw new common_1.BadRequestException('No se pudo crear el trabajador. Revisa los datos.');
        }
    }
    async update(id, dto, req) {
        const before = await this.prisma.employee.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('Trabajador no encontrado');
        const data = { ...dto };
        if (dto.rut !== undefined)
            data.rut = dto.rut.trim();
        if (dto.firstName !== undefined)
            data.firstName = dto.firstName.trim();
        if (dto.lastName !== undefined)
            data.lastName = dto.lastName.trim();
        if (dto.position !== undefined)
            data.position = dto.position?.trim() || null;
        if (dto.departmentId !== undefined)
            data.departmentId = dto.departmentId || null;
        if (dto.branchId !== undefined)
            data.branchId = dto.branchId || null;
        if (dto.hiredAt !== undefined) {
            data.hiredAt = dto.hiredAt ? new Date(dto.hiredAt) : null;
        }
        try {
            await this.validateActiveAssignments(dto.departmentId, dto.branchId);
            return await this.prisma.$transaction(async (tx) => {
                const employee = await tx.employee.update({ where: { id }, data });
                await tx.auditLog.create({
                    data: {
                        userId: req.user.sub,
                        action: 'EMPLOYEE_UPDATED',
                        entityType: 'Employee',
                        entityId: id,
                        beforeJson: {
                            rut: before.rut,
                            firstName: before.firstName,
                            lastName: before.lastName,
                            status: before.status
                        },
                        afterJson: {
                            rut: employee.rut,
                            firstName: employee.firstName,
                            lastName: employee.lastName,
                            status: employee.status
                        }
                    }
                });
                return employee;
            });
        }
        catch (error) {
            if (error?.status)
                throw error;
            if (error?.code === 'P2002') {
                throw new common_1.BadRequestException('Ya existe un trabajador con ese RUT');
            }
            if (error?.code === 'P2003') {
                throw new common_1.BadRequestException('El departamento o la sucursal seleccionados no existen');
            }
            throw new common_1.BadRequestException('No se pudo actualizar el trabajador');
        }
    }
    async deactivate(id, req) {
        const before = await this.prisma.employee.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('Trabajador no encontrado');
        return this.prisma.$transaction(async (tx) => {
            const employee = await tx.employee.update({
                where: { id },
                data: { status: client_1.EmployeeStatus.INACTIVE }
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub,
                    action: 'EMPLOYEE_DEACTIVATED',
                    entityType: 'Employee',
                    entityId: id,
                    beforeJson: { status: before.status },
                    afterJson: { status: employee.status }
                }
            });
            return { message: 'Trabajador desactivado; se conserva su historial', employee };
        });
    }
    async activate(id, req) {
        const before = await this.prisma.employee.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException('Trabajador no encontrado');
        return this.prisma.$transaction(async (tx) => {
            const employee = await tx.employee.update({
                where: { id },
                data: { status: client_1.EmployeeStatus.ACTIVE }
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub,
                    action: 'EMPLOYEE_ACTIVATED',
                    entityType: 'Employee',
                    entityId: id,
                    beforeJson: { status: before.status },
                    afterJson: { status: employee.status }
                }
            });
            return {
                message: 'Trabajador reactivado; se conserva su historial',
                employee
            };
        });
    }
};
exports.EmployeesController = EmployeesController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('employees.read'),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('employees.read'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EmployeesController.prototype, "getOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateEmployeeDto, Object]),
    __metadata("design:returntype", Promise)
], EmployeesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateEmployeeDto, Object]),
    __metadata("design:returntype", Promise)
], EmployeesController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/deactivate'),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EmployeesController.prototype, "deactivate", null);
__decorate([
    (0, common_1.Post)(':id/activate'),
    (0, permissions_decorator_1.RequirePermissions)('employees.write'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EmployeesController.prototype, "activate", null);
exports.EmployeesController = EmployeesController = __decorate([
    (0, swagger_1.ApiTags)('employees'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('employees'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], EmployeesController);
//# sourceMappingURL=employees.controller.js.map