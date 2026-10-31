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
exports.ShiftsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("./prisma.service");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const permissions_guard_1 = require("./permissions.guard");
const permissions_decorator_1 = require("./permissions.decorator");
class CreateShiftDto {
    name;
    startTime;
    endTime;
    breakStart;
    breakEnd;
    toleranceMinutes;
    mode;
    crossesMidnight;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], CreateShiftDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^([01]\d|2[0-3]):[0-5]\d$/),
    __metadata("design:type", String)
], CreateShiftDto.prototype, "startTime", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^([01]\d|2[0-3]):[0-5]\d$/),
    __metadata("design:type", String)
], CreateShiftDto.prototype, "endTime", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^([01]\d|2[0-3]):[0-5]\d$/),
    __metadata("design:type", String)
], CreateShiftDto.prototype, "breakStart", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^([01]\d|2[0-3]):[0-5]\d$/),
    __metadata("design:type", String)
], CreateShiftDto.prototype, "breakEnd", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateShiftDto.prototype, "toleranceMinutes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.ShiftMode),
    __metadata("design:type", String)
], CreateShiftDto.prototype, "mode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateShiftDto.prototype, "crossesMidnight", void 0);
class CloseAssignmentDto {
    validTo;
}
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CloseAssignmentDto.prototype, "validTo", void 0);
class AssignShiftDto {
    employeeId;
    validFrom;
    validTo;
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AssignShiftDto.prototype, "employeeId", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AssignShiftDto.prototype, "validFrom", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AssignShiftDto.prototype, "validTo", void 0);
let ShiftsController = class ShiftsController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    list() {
        return this.prisma.shift.findMany({
            include: {
                assignments: {
                    include: {
                        employee: {
                            select: {
                                id: true, rut: true, firstName: true, lastName: true, status: true
                            }
                        }
                    },
                    orderBy: { validFrom: 'desc' }
                }
            },
            orderBy: { name: 'asc' }
        });
    }
    async create(dto, req) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const shift = await tx.shift.create({
                    data: {
                        name: dto.name.trim(),
                        startTime: dto.startTime,
                        endTime: dto.endTime,
                        breakStart: dto.breakStart ?? null,
                        breakEnd: dto.breakEnd ?? null,
                        toleranceMinutes: dto.toleranceMinutes ?? 0,
                        mode: dto.mode ?? client_1.ShiftMode.FOUR_PUNCH,
                        crossesMidnight: dto.crossesMidnight ?? false
                    }
                });
                await tx.auditLog.create({
                    data: {
                        userId: req.user.sub,
                        action: 'SHIFT_CREATED',
                        entityType: 'Shift',
                        entityId: shift.id,
                        afterJson: {
                            name: shift.name,
                            startTime: shift.startTime,
                            endTime: shift.endTime,
                            mode: shift.mode
                        }
                    }
                });
                return shift;
            });
        }
        catch (error) {
            if (error?.code === 'P2002') {
                throw new common_1.BadRequestException('Ya existe un turno con ese nombre');
            }
            throw error;
        }
    }
    async assign(shiftId, dto, req) {
        const [shift, employee] = await Promise.all([
            this.prisma.shift.findUnique({ where: { id: shiftId } }),
            this.prisma.employee.findUnique({ where: { id: dto.employeeId } })
        ]);
        if (!shift || !shift.active)
            throw new common_1.NotFoundException('Turno no encontrado o inactivo');
        if (!employee || employee.status !== 'ACTIVE') {
            throw new common_1.BadRequestException('Trabajador no encontrado o inactivo');
        }
        const validFrom = new Date(dto.validFrom);
        const validTo = dto.validTo ? new Date(dto.validTo) : null;
        if (validTo && validTo < validFrom) {
            throw new common_1.BadRequestException('La fecha final no puede ser anterior a la inicial');
        }
        return this.prisma.$transaction(async (tx) => {
            const assignment = await tx.shiftAssignment.create({
                data: { shiftId, employeeId: dto.employeeId, validFrom, validTo }
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub,
                    action: 'SHIFT_ASSIGNED',
                    entityType: 'ShiftAssignment',
                    entityId: assignment.id,
                    afterJson: { shiftId, employeeId: dto.employeeId, validFrom, validTo }
                }
            });
            return assignment;
        });
    }
    async closeAssignment(shiftId, assignmentId, dto, req) {
        const assignment = await this.prisma.shiftAssignment.findFirst({
            where: { id: assignmentId, shiftId },
            include: {
                employee: { select: { id: true, rut: true, firstName: true, lastName: true } },
                shift: { select: { id: true, name: true } }
            }
        });
        if (!assignment) {
            throw new common_1.NotFoundException('La asignación no existe para este turno');
        }
        if (assignment.validTo) {
            throw new common_1.BadRequestException('Esta asignación ya está cerrada; no se puede modificar su fecha de término');
        }
        const dateOnly = dto.validTo.slice(0, 10);
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateOnly)) {
            throw new common_1.BadRequestException('La fecha de término no es válida');
        }
        const validTo = new Date(`${dateOnly}T00:00:00.000Z`);
        if (Number.isNaN(validTo.getTime()) ||
            validTo.toISOString().slice(0, 10) !== dateOnly) {
            throw new common_1.BadRequestException('La fecha de término no es válida');
        }
        const validFromDate = assignment.validFrom.toISOString().slice(0, 10);
        if (dateOnly < validFromDate) {
            throw new common_1.BadRequestException('La fecha de término no puede ser anterior al día de inicio');
        }
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.shiftAssignment.update({
                where: { id: assignmentId },
                data: { validTo }
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub,
                    action: 'SHIFT_ASSIGNMENT_CLOSED',
                    entityType: 'ShiftAssignment',
                    entityId: assignment.id,
                    beforeJson: {
                        validFrom: assignment.validFrom.toISOString(),
                        validTo: assignment.validTo?.toISOString() ?? null
                    },
                    afterJson: {
                        validFrom: updated.validFrom.toISOString(),
                        validTo: updated.validTo?.toISOString() ?? null
                    },
                    reason: 'Cierre de vigencia de la asignación'
                }
            });
            return {
                message: 'Vigencia de la asignación actualizada; se conserva el historial',
                assignment: updated
            };
        });
    }
    async setShiftStatus(shiftId, body, req) {
        if (typeof body.active !== 'boolean') {
            throw new common_1.BadRequestException('Debes indicar active como true o false');
        }
        const before = await this.prisma.shift.findUnique({
            where: { id: shiftId }
        });
        if (!before)
            throw new common_1.NotFoundException('Turno no encontrado');
        return this.prisma.$transaction(async (tx) => {
            const shift = await tx.shift.update({
                where: { id: shiftId },
                data: { active: body.active }
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub,
                    action: body.active ? 'SHIFT_ACTIVATED' : 'SHIFT_DEACTIVATED',
                    entityType: 'Shift',
                    entityId: shift.id,
                    beforeJson: { active: before.active },
                    afterJson: { active: shift.active }
                }
            });
            return {
                message: body.active
                    ? 'Turno reactivado correctamente'
                    : 'Turno desactivado; se conserva su historial',
                shift
            };
        });
    }
};
exports.ShiftsController = ShiftsController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('employees.read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ShiftsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.RequirePermissions)('shifts.manage'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateShiftDto, Object]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/assignments'),
    (0, permissions_decorator_1.RequirePermissions)('shifts.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, AssignShiftDto, Object]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "assign", null);
__decorate([
    (0, common_1.Post)(':id/assignments/:assignmentId/close'),
    (0, permissions_decorator_1.RequirePermissions)('shifts.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('assignmentId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, CloseAssignmentDto, Object]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "closeAssignment", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, permissions_decorator_1.RequirePermissions)('shifts.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "setShiftStatus", null);
exports.ShiftsController = ShiftsController = __decorate([
    (0, swagger_1.ApiTags)('shifts'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('shifts'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ShiftsController);
//# sourceMappingURL=shifts.controller.js.map