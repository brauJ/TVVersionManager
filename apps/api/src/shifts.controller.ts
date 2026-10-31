import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean, IsEnum, IsInt, IsOptional, IsString,
  Matches, Min, MinLength, IsDateString
} from 'class-validator';
import { ShiftMode } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import {
  Body, Controller, Get, Param, Patch, Post, Delete, Req, UseGuards,
  BadRequestException, NotFoundException, ConflictException
} from '@nestjs/common';

class CreateShiftDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) breakStart?: string;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) breakEnd?: string;
  @IsOptional() @IsInt() @Min(0) toleranceMinutes?: number;
  @IsOptional() @IsEnum(ShiftMode) mode?: ShiftMode;
  @IsOptional() @IsBoolean() crossesMidnight?: boolean;
}

class CloseAssignmentDto {
  @IsDateString() validTo!: string;
}

class AssignShiftDto {
  @IsString() employeeId!: string;
  @IsDateString() validFrom!: string;
  @IsOptional() @IsDateString() validTo?: string;
}

@ApiTags('shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('employees.read')
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

  @Post()
  @RequirePermissions('shifts.manage')
  async create(@Body() dto: CreateShiftDto, @Req() req: any) {
    try {
      return await this.prisma.$transaction(async tx => {
        const shift = await tx.shift.create({
          data: {
            name: dto.name.trim(),
            startTime: dto.startTime,
            endTime: dto.endTime,
            breakStart: dto.breakStart ?? null,
            breakEnd: dto.breakEnd ?? null,
            toleranceMinutes: dto.toleranceMinutes ?? 0,
            mode: dto.mode ?? ShiftMode.FOUR_PUNCH,
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
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Ya existe un turno con ese nombre');
      }
      throw error;
    }
  }

  @Post(':id/assignments')
  @RequirePermissions('shifts.manage')
  async assign(
    @Param('id') shiftId: string,
    @Body() dto: AssignShiftDto,
    @Req() req: any
  ) {
    const [shift, employee] = await Promise.all([
      this.prisma.shift.findUnique({ where: { id: shiftId } }),
      this.prisma.employee.findUnique({ where: { id: dto.employeeId } })
    ]);

    if (!shift || !shift.active) throw new NotFoundException('Turno no encontrado o inactivo');
    if (!employee || employee.status !== 'ACTIVE') {
      throw new BadRequestException('Trabajador no encontrado o inactivo');
    }

    const validFrom = new Date(dto.validFrom);
    const validTo = dto.validTo ? new Date(dto.validTo) : null;
    if (validTo && validTo < validFrom) {
      throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
    }

    return this.prisma.$transaction(async tx => {
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

  @Post(':id/assignments/:assignmentId/close')
  @RequirePermissions('shifts.manage')
  async closeAssignment(
    @Param('id') shiftId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: CloseAssignmentDto,
    @Req() req: any
  ) {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: { id: assignmentId, shiftId },
      include: {
        employee: { select: { id: true, rut: true, firstName: true, lastName: true } },
        shift: { select: { id: true, name: true } }
      }
    });

    if (!assignment) {
      throw new NotFoundException('La asignación no existe para este turno');
    }

    if (assignment.validTo) {
      throw new BadRequestException(
        'Esta asignación ya está cerrada; no se puede modificar su fecha de término'
      );
    }

    const dateOnly = dto.validTo.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      throw new BadRequestException('La fecha de término no es válida');
    }

    const validTo = new Date(`${dateOnly}T00:00:00.000Z`);
    if (
      Number.isNaN(validTo.getTime()) ||
      validTo.toISOString().slice(0, 10) !== dateOnly
    ) {
      throw new BadRequestException('La fecha de término no es válida');
    }

    const validFromDate = assignment.validFrom.toISOString().slice(0, 10);
    if (dateOnly < validFromDate) {
      throw new BadRequestException(
        'La fecha de término no puede ser anterior al día de inicio'
      );
    }

    return this.prisma.$transaction(async tx => {
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

  @Patch(':id/status')
  @RequirePermissions('shifts.manage')
  async setShiftStatus(
    @Param('id') shiftId: string,
    @Body() body: { active: boolean },
    @Req() req: any
  ) {
    if (typeof body.active !== 'boolean') {
      throw new BadRequestException('Debes indicar active como true o false');
    }

    const before = await this.prisma.shift.findUnique({
      where: { id: shiftId }
    });

    if (!before) throw new NotFoundException('Turno no encontrado');

    return this.prisma.$transaction(async tx => {
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
 @Delete(':id')
  @RequirePermissions('shifts.manage')
  async deleteShift(
    @Param('id') shiftId: string,
    @Req() req: any
  ) {
    return this.prisma.$transaction(async tx => {
      const shift = await tx.shift.findUnique({
        where: { id: shiftId },
        include: {
          _count: {
            select: { assignments: true }
          }
        }
      });

      if (!shift) {
        throw new NotFoundException('Turno no encontrado');
      }

      if (shift._count.assignments > 0) {
        throw new ConflictException(
          'No se puede eliminar este turno porque tiene asignaciones asociadas. Desactívalo para conservar su historial.'
        );
      }

      await tx.shift.delete({
        where: { id: shiftId }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.sub,
          action: 'SHIFT_DELETED',
          entityType: 'Shift',
          entityId: shift.id,
          beforeJson: {
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            active: shift.active
          }
        }
      });

      return {
        message: 'Turno eliminado correctamente'
      };
    });
  }
}
