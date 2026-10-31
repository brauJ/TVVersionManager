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
exports.BiometricDeviceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const node_crypto_1 = require("node:crypto");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("./prisma.service");
class BiometricPunchDto {
    eventId;
    deviceTemplateId;
    occurredAt;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, class_validator_1.MaxLength)(190),
    __metadata("design:type", String)
], BiometricPunchDto.prototype, "eventId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(190),
    __metadata("design:type", String)
], BiometricPunchDto.prototype, "deviceTemplateId", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], BiometricPunchDto.prototype, "occurredAt", void 0);
let BiometricDeviceController = class BiometricDeviceController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    verifySecret(received, storedHash) {
        if (!received || received.length < 32 || received.length > 512) {
            return false;
        }
        const receivedHash = (0, node_crypto_1.createHash)('sha256').update(received, 'utf8').digest();
        const expected = Buffer.from(storedHash, 'hex');
        if (expected.length !== receivedHash.length) {
            return false;
        }
        return (0, node_crypto_1.timingSafeEqual)(receivedHash, expected);
    }
    async authenticate(deviceId, secret) {
        if (!deviceId || deviceId.length > 190 || !secret) {
            throw new common_1.UnauthorizedException('Dispositivo no autenticado');
        }
        const device = await this.prisma.biometricDevice.findUnique({
            where: { id: deviceId },
            select: { id: true, active: true, deviceKeyHash: true },
        });
        if (!device || !device.active || !this.verifySecret(secret, device.deviceKeyHash)) {
            throw new common_1.UnauthorizedException('Dispositivo no autenticado');
        }
        return device;
    }
    async punch(deviceId, secret, dto) {
        const device = await this.authenticate(deviceId ?? '', secret);
        const occurredAt = new Date(dto.occurredAt);
        if (!Number.isFinite(occurredAt.getTime()) ||
            occurredAt.getTime() > Date.now() + 60_000 ||
            occurredAt.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000) {
            throw new common_1.BadRequestException('La fecha de la marcación no es válida o está fuera del intervalo permitido');
        }
        const credential = await this.prisma.biometricCredential.findUnique({
            where: { deviceTemplateId: dto.deviceTemplateId },
            include: { employee: true },
        });
        if (!credential || !credential.active || credential.revokedAt ||
            credential.employee.status !== 'ACTIVE') {
            throw new common_1.BadRequestException('No existe una credencial biométrica activa para un trabajador activo');
        }
        const dateParts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(occurredAt);
        const part = (type) => dateParts.find(p => p.type === type)?.value;
        const localDate = `${part('year')}-${part('month')}-${part('day')}`;
        const workDate = new Date(`${localDate}T00:00:00.000Z`);
        try {
            return await this.prisma.$transaction(async (tx) => {
                const priorEvent = await tx.deviceEvent.findUnique({
                    where: { eventId: dto.eventId },
                });
                if (priorEvent) {
                    if (priorEvent.deviceId !== device.id) {
                        throw new common_1.ConflictException('El identificador del evento ya fue utilizado');
                    }
                    return {
                        ok: true,
                        duplicate: true,
                        eventId: dto.eventId,
                        result: priorEvent.result,
                    };
                }
                const assignment = await tx.shiftAssignment.findFirst({
                    where: {
                        employeeId: credential.employeeId,
                        validFrom: { lte: occurredAt },
                        OR: [{ validTo: null }, { validTo: { gte: occurredAt } }],
                        shift: { active: true },
                    },
                    include: { shift: true },
                    orderBy: { validFrom: 'desc' },
                });
                const session = await tx.workSession.findUnique({
                    where: {
                        employeeId_workDate: {
                            employeeId: credential.employeeId,
                            workDate,
                        },
                    },
                    include: {
                        records: {
                            where: { status: { not: 'VOIDED' } },
                            orderBy: { occurredAt: 'asc' },
                        },
                    },
                });
                const expectedTypes = assignment?.shift.mode === 'TWO_PUNCH'
                    ? ['ENTRY', 'EXIT']
                    : ['ENTRY', 'BREAK_START', 'BREAK_END', 'EXIT'];
                const existingRecords = session?.records ?? [];
                const expectedType = expectedTypes[existingRecords.length];
                const invalidSequence = !assignment ||
                    !expectedType ||
                    existingRecords.some(r => r.status === 'PENDING_REVIEW') ||
                    (existingRecords.length > 0 &&
                        occurredAt.getTime() <= existingRecords[existingRecords.length - 1].occurredAt.getTime());
                const result = invalidSequence ? 'PENDING_REVIEW' : 'ACCEPTED';
                await tx.deviceEvent.create({
                    data: {
                        eventId: dto.eventId,
                        deviceId: device.id,
                        result,
                        details: invalidSequence
                            ? 'Secuencia o turno requiere revisión'
                            : `Tipo calculado: ${expectedType}`,
                    },
                });
                await tx.biometricDevice.update({
                    where: { id: device.id },
                    data: { lastSeenAt: new Date() },
                });
                if (invalidSequence) {
                    await tx.auditLog.create({
                        data: {
                            action: 'BIOMETRIC_PUNCH_PENDING_REVIEW',
                            entityType: 'DeviceEvent',
                            entityId: dto.eventId,
                            reason: 'Marcación biométrica requiere revisión: turno ausente, secuencia incompleta o tiempo fuera de orden.',
                            afterJson: {
                                deviceId: device.id,
                                employeeId: credential.employeeId,
                                eventId: dto.eventId,
                                occurredAt: occurredAt.toISOString(),
                                workDate: localDate,
                            },
                        },
                    });
                    return {
                        ok: true,
                        eventId: dto.eventId,
                        result: 'PENDING_REVIEW',
                        message: 'Evento registrado; requiere revisión administrativa.',
                    };
                }
                const activeSession = session ?? await tx.workSession.create({
                    data: {
                        employeeId: credential.employeeId,
                        workDate,
                        shiftId: assignment.shiftId,
                    },
                    include: { records: true },
                });
                const record = await tx.attendanceRecord.create({
                    data: {
                        eventId: dto.eventId,
                        employeeId: credential.employeeId,
                        sessionId: activeSession.id,
                        type: expectedType,
                        method: 'FINGERPRINT',
                        status: 'CONFIRMED',
                        occurredAt,
                        deviceId: device.id,
                    },
                });
                await tx.auditLog.create({
                    data: {
                        action: 'BIOMETRIC_PUNCH_CONFIRMED',
                        entityType: 'AttendanceRecord',
                        entityId: record.id,
                        reason: 'Marcación biométrica recibida desde un dispositivo autenticado.',
                        afterJson: {
                            eventId: dto.eventId,
                            deviceId: device.id,
                            employeeId: credential.employeeId,
                            type: expectedType,
                            occurredAt: occurredAt.toISOString(),
                        },
                    },
                });
                return {
                    ok: true,
                    eventId: dto.eventId,
                    result: 'ACCEPTED',
                    type: expectedType,
                    attendanceRecordId: record.id,
                };
            }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        }
        catch (error) {
            if (error instanceof common_1.ConflictException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002') {
                return {
                    ok: true,
                    duplicate: true,
                    eventId: dto.eventId,
                    result: 'DUPLICATE',
                };
            }
            throw new common_1.ServiceUnavailableException('No se pudo procesar la marcación. No repitas el evento con un ID nuevo.');
        }
    }
    async status(deviceId, secret) {
        const device = await this.authenticate(deviceId ?? '', secret);
        try {
            await this.prisma.biometricDevice.update({
                where: { id: device.id },
                data: { lastSeenAt: new Date() },
            });
        }
        catch {
            throw new common_1.ServiceUnavailableException('No se pudo actualizar el estado del dispositivo');
        }
        return { ok: true, deviceId: device.id, status: 'authenticated' };
    }
};
exports.BiometricDeviceController = BiometricDeviceController;
__decorate([
    (0, common_1.Post)('punch'),
    __param(0, (0, common_1.Headers)('x-device-id')),
    __param(1, (0, common_1.Headers)('x-device-secret')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, BiometricPunchDto]),
    __metadata("design:returntype", Promise)
], BiometricDeviceController.prototype, "punch", null);
__decorate([
    (0, common_1.Get)('status'),
    __param(0, (0, common_1.Headers)('x-device-id')),
    __param(1, (0, common_1.Headers)('x-device-secret')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BiometricDeviceController.prototype, "status", null);
exports.BiometricDeviceController = BiometricDeviceController = __decorate([
    (0, swagger_1.ApiExcludeController)(),
    (0, common_1.Controller)('device'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BiometricDeviceController);
//# sourceMappingURL=biometric-device.controller.js.map