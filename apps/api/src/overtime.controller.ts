import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsString, MinLength } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';

class CreateOvertimeDto {
  @IsString()
  employeeId!: string;

  @IsDateString()
  workDate!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsString()
  @MinLength(8)
  reason!: string;
}

class CancelOvertimeDto {
  @IsString()
  @MinLength(8)
  reason!: string;
}

@ApiTags('overtime')
@ApiBearerAuth()
@Controller('overtime')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OvertimeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('overtime.read')
  async list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    const where: any = {};

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (from || to) {
      where.workDate = {};
      if (from) {
        const date = new Date(`${from}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime())) {
          throw new BadRequestException('Fecha inicial inválida');
        }
        where.workDate.gte = date;
      }
      if (to) {
        const date = new Date(`${to}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime())) {
          throw new BadRequestException('Fecha final inválida');
        }
        where.workDate.lte = date;
      }
    }

    if (status === 'ACTIVE' || status === 'CANCELLED') {
      where.status = status;
    }

    const rows = await this.prisma.overtimeAuthorization.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { startAt: 'desc' }],
      take: 1000,
      include: {
        employee: {
          select: {
            id: true,
            rut: true,
            firstName: true,
            lastName: true,
            position: true,
            status: true,
          },
        },
        authorizedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        cancelledBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    const now = new Date();

    return rows.map((row) => ({
      ...row,
      effectiveStatus:
        row.status === 'CANCELLED'
          ? 'CANCELLED'
          : row.endAt < now
            ? 'EXPIRED'
            : 'ACTIVE',
    }));
  }

  @Post()
  @RequirePermissions('overtime.manage')
  async create(@Body() dto: CreateOvertimeDto, @Req() req: any) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const workDate = new Date(`${dto.workDate}T00:00:00.000Z`);
    const reason = dto.reason.trim();

    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      Number.isNaN(workDate.getTime())
    ) {
      throw new BadRequestException('Fecha u horario inválido');
    }

    if (endAt <= startAt) {
      throw new BadRequestException(
        'La hora de término debe ser posterior a la hora de inicio',
      );
    }

    if (reason.length < 8) {
      throw new BadRequestException(
        'El motivo debe tener al menos 8 caracteres',
      );
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: {
        id: true,
        rut: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!employee || employee.status !== 'ACTIVE') {
      throw new BadRequestException(
        'El trabajador no existe o no está activo',
      );
    }

    // Evita autorizaciones activas que se superpongan para el mismo trabajador.
    const overlap = await this.prisma.overtimeAuthorization.findFirst({
      where: {
        employeeId: employee.id,
        status: 'ACTIVE',
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });

    if (overlap) {
      throw new BadRequestException(
        'Ya existe una autorización que se superpone con ese horario',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const authorization = await tx.overtimeAuthorization.create({
        data: {
          employeeId: employee.id,
          authorizedByUserId: req.user.sub,
          workDate,
          startAt,
          endAt,
          reason,
        },
        include: {
          employee: {
            select: {
              id: true,
              rut: true,
              firstName: true,
              lastName: true,
            },
          },
          authorizedBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.sub,
          action: 'OVERTIME_AUTHORIZATION_CREATED',
          entityType: 'OvertimeAuthorization',
          entityId: authorization.id,
          reason,
          afterJson: {
            employeeId: employee.id,
            workDate: dto.workDate,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            reason,
          },
        },
      });

      return {
        ...authorization,
        effectiveStatus: 'ACTIVE',
      };
    });
  }

  @Post(':id/cancel')
  @RequirePermissions('overtime.cancel')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOvertimeDto,
    @Req() req: any,
  ) {
    const reason = dto.reason.trim();

    if (reason.length < 8) {
      throw new BadRequestException(
        'El motivo de anulación debe tener al menos 8 caracteres',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.overtimeAuthorization.findUnique({
        where: { id },
        include: {
          employee: {
            select: {
              id: true,
              rut: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!before) {
        throw new NotFoundException('Autorización no encontrada');
      }

      if (before.status === 'CANCELLED') {
        throw new BadRequestException(
          'Esta autorización ya se encuentra anulada',
        );
      }

      const updated = await tx.overtimeAuthorization.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByUserId: req.user.sub,
          cancellationReason: reason,
        },
        include: {
          employee: {
            select: {
              id: true,
              rut: true,
              firstName: true,
              lastName: true,
            },
          },
          authorizedBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          cancelledBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.sub,
          action: 'OVERTIME_AUTHORIZATION_CANCELLED',
          entityType: 'OvertimeAuthorization',
          entityId: id,
          reason,
          beforeJson: {
            status: before.status,
            startAt: before.startAt.toISOString(),
            endAt: before.endAt.toISOString(),
          },
          afterJson: {
            status: updated.status,
            cancelledAt: updated.cancelledAt?.toISOString(),
            cancellationReason: reason,
          },
        },
      });

      return {
        ...updated,
        effectiveStatus: 'CANCELLED',
      };
    });
  }
}