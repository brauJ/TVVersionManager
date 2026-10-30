import {
  Controller,
  Get,
  Post,
  Headers,
  Body,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  IsISO8601,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Prisma, AttendanceType } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { PrismaService } from './prisma.service';

class BiometricPunchDto {
  @IsString()
  @MinLength(8)
  @MaxLength(190)
  eventId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(190)
  deviceTemplateId!: string;

  @IsISO8601()
  occurredAt!: string;
}

const TIME_ZONE = 'America/Santiago';

type LocalParts = {
  date: string;
  minute: number;
};

function getLocalParts(date: Date): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const value = (type: string) =>
    parts.find(part => part.type === type)?.value ?? '';

  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minute: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateAtUtcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function isInsideShift(
  localMinute: number,
  shift: {
    startTime: string;
    endTime: string;
    toleranceMinutes: number;
    crossesMidnight: boolean;
  },
): boolean {
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);
  const crosses = shift.crossesMidnight || end <= start;
  const duration = crosses ? end + 1440 - start : end - start;

  let offset = localMinute - start;

  if (crosses && offset < 0) {
    offset += 1440;
  }

  return (
    offset >= -shift.toleranceMinutes &&
    offset <= duration + shift.toleranceMinutes
  );
}

function expectedPunchTypes(mode: string): AttendanceType[] {
  return mode === 'TWO_PUNCH'
    ? [AttendanceType.ENTRY, AttendanceType.EXIT]
    : [
        AttendanceType.ENTRY,
        AttendanceType.BREAK_START,
        AttendanceType.BREAK_END,
        AttendanceType.EXIT,
      ];
}

@ApiExcludeController()
@Controller('device')
export class BiometricDeviceController {
  constructor(private readonly prisma: PrismaService) {}

  private verifySecret(
    received: string | undefined,
    storedHash: string,
  ): boolean {
    if (!received || received.length < 32 || received.length > 512) {
      return false;
    }

    const receivedHash = createHash('sha256')
      .update(received, 'utf8')
      .digest();

    const expected = Buffer.from(storedHash, 'hex');

    if (expected.length !== receivedHash.length) {
      return false;
    }

    return timingSafeEqual(receivedHash, expected);
  }

  private async authenticate(
    deviceId: string,
    secret: string | undefined,
  ) {
    if (!deviceId || deviceId.length > 190 || !secret) {
      throw new UnauthorizedException('Dispositivo no autenticado');
    }

    const device = await this.prisma.biometricDevice.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        active: true,
        deviceKeyHash: true,
      },
    });

    if (
      !device ||
      !device.active ||
      !this.verifySecret(secret, device.deviceKeyHash)
    ) {
      throw new UnauthorizedException('Dispositivo no autenticado');
    }

    return device;
  }

  @Post('punch')
  async punch(
    @Headers('x-device-id') deviceId: string | undefined,
    @Headers('x-device-secret') secret: string | undefined,
    @Body() dto: BiometricPunchDto,
  ) {
    const device = await this.authenticate(deviceId ?? '', secret);
    const occurredAt = new Date(dto.occurredAt);

    if (
      !Number.isFinite(occurredAt.getTime()) ||
      occurredAt.getTime() > Date.now() + 60_000 ||
      occurredAt.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'La fecha de la marcación no es válida o está fuera del intervalo permitido',
      );
    }

    const credential = await this.prisma.biometricCredential.findUnique({
      where: { deviceTemplateId: dto.deviceTemplateId },
      include: { employee: true },
    });

    if (
      !credential ||
      !credential.active ||
      credential.revokedAt ||
      credential.employee.status !== 'ACTIVE'
    ) {
      throw new BadRequestException(
        'No existe una credencial biométrica activa para un trabajador activo',
      );
    }

    const local = getLocalParts(occurredAt);
    const previousDate = addDays(local.date, -1);

    try {
      return await this.prisma.$transaction(
        async tx => {
          const priorEvent = await tx.deviceEvent.findUnique({
            where: { eventId: dto.eventId },
          });

          if (priorEvent) {
            if (priorEvent.deviceId !== device.id) {
              throw new ConflictException(
                'El identificador del evento ya fue utilizado',
              );
            }

            const priorRecord = await tx.attendanceRecord.findUnique({
              where: { eventId: dto.eventId },
              select: { id: true, type: true, status: true },
            });

            return {
              ok: true,
              duplicate: true,
              eventId: dto.eventId,
              result: priorEvent.result,
              attendanceRecordId: priorRecord?.id ?? null,
              type: priorRecord?.type ?? null,
              status: priorRecord?.status ?? null,
            };
          }

          // Las asignaciones se consultan por fecha laboral, no comparando
          // directamente una fecha de vigencia con la hora de la marcación.
          const assignments = await tx.shiftAssignment.findMany({
            where: {
              employeeId: credential.employeeId,
              validFrom: { lte: dateAtUtcMidnight(local.date) },
              OR: [
                { validTo: null },
                { validTo: { gte: dateAtUtcMidnight(previousDate) } },
              ],
              shift: { active: true },
            },
            include: { shift: true },
            orderBy: { validFrom: 'desc' },
          });

          // Para una marcación después de medianoche, primero se comprueba
          // si pertenece a un turno nocturno iniciado el día anterior.
          const candidateAssignments = assignments.filter(assignment => {
            const validFrom = assignment.validFrom
              .toISOString()
              .slice(0, 10);
            const validTo = assignment.validTo
              ? assignment.validTo.toISOString().slice(0, 10)
              : null;

            const currentDateValid =
              validFrom <= local.date &&
              (!validTo || validTo >= local.date);

            const previousDateValid =
              validFrom <= previousDate &&
              (!validTo || validTo >= previousDate);

            return currentDateValid || previousDateValid;
          });

          const matchingOvernight = candidateAssignments.find(assignment => {
            const validFrom = assignment.validFrom
              .toISOString()
              .slice(0, 10);
            const validTo = assignment.validTo
              ? assignment.validTo.toISOString().slice(0, 10)
              : null;

            const previousDateValid =
              validFrom <= previousDate &&
              (!validTo || validTo >= previousDate);

            return (
              previousDateValid &&
              assignment.shift.crossesMidnight &&
              isInsideShift(local.minute, assignment.shift)
            );
          });

          const matchingCurrent = candidateAssignments.find(assignment => {
            const validFrom = assignment.validFrom
              .toISOString()
              .slice(0, 10);
            const validTo = assignment.validTo
              ? assignment.validTo.toISOString().slice(0, 10)
              : null;

            return (
              validFrom <= local.date &&
              (!validTo || validTo >= local.date) &&
              isInsideShift(local.minute, assignment.shift)
            );
          });

          const currentAssignment = candidateAssignments.find(assignment => {
            const validFrom = assignment.validFrom
              .toISOString()
              .slice(0, 10);
            const validTo = assignment.validTo
              ? assignment.validTo.toISOString().slice(0, 10)
              : null;

            return (
              validFrom <= local.date &&
              (!validTo || validTo >= local.date)
            );
          });

          const previousOvernightAssignment =
            candidateAssignments.find(assignment => {
              const validFrom = assignment.validFrom
                .toISOString()
                .slice(0, 10);
              const validTo = assignment.validTo
                ? assignment.validTo.toISOString().slice(0, 10)
                : null;

              return (
                validFrom <= previousDate &&
                (!validTo || validTo >= previousDate) &&
                assignment.shift.crossesMidnight
              );
            });

          const assignment =
            matchingOvernight ??
            matchingCurrent ??
            currentAssignment ??
            previousOvernightAssignment ??
            null;

          const workDateString = matchingOvernight
            ? previousDate
            : local.date;

          const workDate = dateAtUtcMidnight(workDateString);

          let session = await tx.workSession.findUnique({
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

          const existingRecords = session?.records ?? [];

          const types = assignment
            ? expectedPunchTypes(assignment.shift.mode)
            : [
                AttendanceType.ENTRY,
                AttendanceType.EXIT,
                AttendanceType.ENTRY,
                AttendanceType.EXIT,
              ];

          // La secuencia se calcula con las marcaciones existentes.
          // Una pendiente NO bloquea las marcaciones siguientes.
          const sequenceIndex = existingRecords.length;
          const expectedType =
            types[sequenceIndex] ?? AttendanceType.EXIT;

          const latestTimestamp = existingRecords.reduce(
            (latest, record) =>
              Math.max(latest, record.occurredAt.getTime()),
            0,
          );

          const reasons: string[] = [];

          if (!assignment) {
            reasons.push('No existe un turno asignado para la fecha laboral');
          } else if (!isInsideShift(local.minute, assignment.shift)) {
            reasons.push(
              'La marcación está fuera del horario del turno y su tolerancia',
            );
          }

          if (sequenceIndex >= types.length) {
            reasons.push(
              'La cantidad de marcaciones supera la secuencia configurada del turno',
            );
          }

          if (
            latestTimestamp > 0 &&
            occurredAt.getTime() <= latestTimestamp
          ) {
            reasons.push(
              'La fecha y hora de esta marcación no sigue el orden cronológico',
            );
          }

          const pending = reasons.length > 0;
          const status = pending
            ? 'PENDING_REVIEW'
            : 'CONFIRMED';

          const result = pending
            ? 'PENDING_REVIEW'
            : 'ACCEPTED';

          const details = pending
            ? reasons.join('; ').slice(0, 255)
            : `Tipo calculado: ${expectedType}`;

          await tx.deviceEvent.create({
            data: {
              eventId: dto.eventId,
              deviceId: device.id,
              result,
              details,
            },
          });

          await tx.biometricDevice.update({
            where: { id: device.id },
            data: { lastSeenAt: new Date() },
          });

          if (!session) {
            session = await tx.workSession.create({
              data: {
                employeeId: credential.employeeId,
                workDate,
                shiftId: assignment?.shiftId ?? null,
              },
              include: { records: true },
            });
          }

          // IMPORTANTE: siempre se crea la marcación laboral.
          // Las irregulares se guardan pendientes, nunca solo como DeviceEvent.
          const record = await tx.attendanceRecord.create({
            data: {
              eventId: dto.eventId,
              employeeId: credential.employeeId,
              sessionId: session.id,
              type: expectedType,
              method: 'FINGERPRINT',
              status,
              occurredAt,
              deviceId: device.id,
            },
          });

          await tx.auditLog.create({
            data: {
              action: pending
                ? 'BIOMETRIC_PUNCH_PENDING_REVIEW'
                : 'BIOMETRIC_PUNCH_CONFIRMED',
              entityType: 'AttendanceRecord',
              entityId: record.id,
              reason: pending
                ? `Marcación biométrica requiere revisión: ${reasons.join('; ')}.`
                : 'Marcación biométrica recibida desde un dispositivo autenticado.',
              afterJson: {
                eventId: dto.eventId,
                deviceId: device.id,
                employeeId: credential.employeeId,
                attendanceRecordId: record.id,
                type: expectedType,
                status,
                occurredAt: occurredAt.toISOString(),
                workDate: workDateString,
                reasons,
                provisionalType: !assignment || sequenceIndex >= types.length,
              },
            },
          });

          return {
            ok: true,
            eventId: dto.eventId,
            result,
            status,
            type: expectedType,
            attendanceRecordId: record.id,
            message: pending
              ? 'Marcación registrada y pendiente de revisión administrativa.'
              : 'Marcación registrada correctamente.',
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 15000,
        },
      );
    } catch (error: unknown) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const originalEvent = await this.prisma.deviceEvent.findUnique({
          where: { eventId: dto.eventId },
          select: { deviceId: true, result: true },
        });

        if (originalEvent && originalEvent.deviceId === device.id) {
          const originalRecord =
            await this.prisma.attendanceRecord.findUnique({
              where: { eventId: dto.eventId },
              select: { id: true, type: true, status: true },
            });

          return {
            ok: true,
            duplicate: true,
            eventId: dto.eventId,
            result: originalEvent.result,
            attendanceRecordId: originalRecord?.id ?? null,
            type: originalRecord?.type ?? null,
            status: originalRecord?.status ?? null,
          };
        }

        return {
          ok: true,
          duplicate: true,
          eventId: dto.eventId,
          result: 'DUPLICATE',
        };
      }

      throw new ServiceUnavailableException(
        'No se pudo procesar la marcación. No repitas el evento con un ID nuevo.',
      );
    }
  }

  @Get('status')
  async status(
    @Headers('x-device-id') deviceId: string | undefined,
    @Headers('x-device-secret') secret: string | undefined,
  ) {
    const device = await this.authenticate(deviceId ?? '', secret);

    try {
      await this.prisma.biometricDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo actualizar el estado del dispositivo',
      );
    }

    return {
      ok: true,
      deviceId: device.id,
      status: 'authenticated',
    };
  }

  @Get('events')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('attendance.read')
  async listEvents() {
    return this.prisma.deviceEvent.findMany({
      select: {
        id: true,
        eventId: true,
        deviceId: true,
        receivedAt: true,
        result: true,
        details: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: 500,
    });
  }
}