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
exports.AttendanceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const prisma_service_1 = require("./prisma.service");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const permissions_guard_1 = require("./permissions.guard");
const permissions_decorator_1 = require("./permissions.decorator");
class ReviewAttendanceDto {
    status;
    reason;
}
__decorate([
    (0, class_validator_1.IsIn)(['CONFIRMED', 'VOIDED']),
    __metadata("design:type", String)
], ReviewAttendanceDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], ReviewAttendanceDto.prototype, "reason", void 0);
class ManualAttendanceDto {
    employeeId;
    type;
    occurredAt;
    reason;
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ManualAttendanceDto.prototype, "employeeId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['ENTRY', 'BREAK_START', 'BREAK_END', 'EXIT']),
    __metadata("design:type", String)
], ManualAttendanceDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], ManualAttendanceDto.prototype, "occurredAt", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], ManualAttendanceDto.prototype, "reason", void 0);
let AttendanceController = class AttendanceController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(from, to, employeeId) {
        const where = {};
        if (employeeId)
            where.employeeId = employeeId;
        if (from || to)
            where.occurredAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
        const records = await this.prisma.attendanceRecord.findMany({
            where,
            include: { employee: true },
            orderBy: { occurredAt: 'desc' },
            take: 1000
        });
        if (!records.length)
            return [];
        const auditLogs = await this.prisma.auditLog.findMany({
            where: {
                entityType: 'AttendanceRecord',
                entityId: { in: records.map(record => record.id) },
                action: {
                    in: [
                        'ATTENDANCE_MANUAL_CREATED',
                        'ATTENDANCE_REVIEW_CONFIRMED',
                        'ATTENDANCE_REVIEW_VOIDED'
                    ]
                }
            },
            select: {
                entityId: true,
                action: true,
                reason: true,
                createdAt: true,
                user: { select: { id: true, fullName: true, email: true } }
            },
            orderBy: { createdAt: 'asc' }
        });
        const creatorIds = [...new Set(records
                .map(record => record.createdByUserId)
                .filter((id) => Boolean(id)))];
        const creators = creatorIds.length
            ? await this.prisma.user.findMany({
                where: { id: { in: creatorIds } },
                select: { id: true, fullName: true, email: true }
            })
            : [];
        const creatorsById = new Map(creators.map(user => [user.id, user]));
        const logsByRecord = new Map();
        for (const log of auditLogs) {
            if (!log.entityId)
                continue;
            const current = logsByRecord.get(log.entityId) ?? [];
            current.push(log);
            logsByRecord.set(log.entityId, current);
        }
        return records.map(record => ({
            ...record,
            creator: record.createdByUserId
                ? creatorsById.get(record.createdByUserId) ?? null
                : null,
            auditTrail: (logsByRecord.get(record.id) ?? []).map(log => ({
                action: log.action,
                reason: log.reason,
                createdAt: log.createdAt,
                user: log.user
            }))
        }));
    }
    async review(id, dto, req) {
        const reason = dto.reason.trim();
        if (reason.length < 8) {
            throw new common_1.BadRequestException('El motivo debe tener al menos 8 caracteres');
        }
        return this.prisma.$transaction(async (tx) => {
            const before = await tx.attendanceRecord.findUnique({
                where: { id },
                include: { employee: true }
            });
            if (!before) {
                throw new common_1.NotFoundException('Marcación no encontrada');
            }
            if (before.status !== 'PENDING_REVIEW') {
                throw new common_1.BadRequestException('Solo se pueden revisar marcaciones pendientes de revisión');
            }
            const changed = await tx.attendanceRecord.updateMany({
                where: { id, status: 'PENDING_REVIEW' },
                data: { status: dto.status }
            });
            if (changed.count !== 1) {
                throw new common_1.BadRequestException('La marcación cambió mientras se revisaba. Actualiza la lista');
            }
            await tx.auditLog.create({
                data: {
                    userId: req.user.sub,
                    action: dto.status === 'CONFIRMED'
                        ? 'ATTENDANCE_REVIEW_CONFIRMED'
                        : 'ATTENDANCE_REVIEW_VOIDED',
                    entityType: 'AttendanceRecord',
                    entityId: id,
                    reason,
                    beforeJson: {
                        status: before.status,
                        type: before.type,
                        occurredAt: before.occurredAt.toISOString()
                    },
                    afterJson: {
                        status: dto.status,
                        reason
                    }
                }
            });
            return tx.attendanceRecord.findUnique({
                where: { id },
                include: { employee: true }
            });
        });
    }
    async manual(dto, req) {
        const adminUserId = req.user.sub;
        if (!dto.reason.trim())
            throw new common_1.BadRequestException('El motivo es obligatorio');
        const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
        if (!employee || employee.status !== 'ACTIVE')
            throw new common_1.BadRequestException('Trabajador no encontrado o inactivo');
        const id = `manual_${crypto.randomUUID()}`;
        return this.prisma.$transaction(async (tx) => {
            const record = await tx.attendanceRecord.create({ data: {
                    eventId: id, employeeId: dto.employeeId, type: dto.type,
                    method: 'ADMIN_MANUAL', status: 'CONFIRMED', occurredAt: new Date(dto.occurredAt),
                    manualReason: dto.reason.trim(), createdByUserId: adminUserId
                } });
            await tx.manualAttendanceChange.create({ data: {
                    attendanceRecordId: record.id, action: 'CREATED', reason: dto.reason.trim(), adminUserId,
                    afterJson: { type: dto.type, occurredAt: dto.occurredAt, method: 'ADMIN_MANUAL' }
                } });
            await tx.auditLog.create({ data: {
                    userId: adminUserId, action: 'ATTENDANCE_MANUAL_CREATED', entityType: 'AttendanceRecord',
                    entityId: record.id, reason: dto.reason.trim(), afterJson: { type: dto.type, occurredAt: dto.occurredAt }
                } });
            return record;
        });
    }
};
exports.AttendanceController = AttendanceController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('attendance.read'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('employeeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], AttendanceController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)(':id/review'),
    (0, permissions_decorator_1.RequirePermissions)('attendance.review'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ReviewAttendanceDto, Object]),
    __metadata("design:returntype", Promise)
], AttendanceController.prototype, "review", null);
__decorate([
    (0, common_1.Post)('manual'),
    (0, permissions_decorator_1.RequirePermissions)('attendance.manual'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ManualAttendanceDto, Object]),
    __metadata("design:returntype", Promise)
], AttendanceController.prototype, "manual", null);
exports.AttendanceController = AttendanceController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, swagger_1.ApiTags)('attendance'),
    (0, common_1.Controller)('attendance'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AttendanceController);
//# sourceMappingURL=attendance.controller.js.map