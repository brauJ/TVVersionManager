import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';

class CreateBiometricCredentialDto {
  @IsString()
  @MinLength(1)
  @MaxLength(190)
  employeeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(190)
  deviceTemplateId!: string;
}

@ApiTags('biometric-credentials')
@ApiBearerAuth()
@Controller('biometric-credentials')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BiometricCredentialsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('biometrics.manage')
  async list() {
    return this.prisma.biometricCredential.findMany({
      select: {
        id: true,
        employeeId: true,
        deviceTemplateId: true,
        active: true,
        enrolledBy: true,
        enrolledAt: true,
        revokedAt: true,
        employee: {
          select: {
            id: true,
            rut: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
      take: 500,
    });
  }

  @Post()
  @RequirePermissions('biometrics.manage')
  async create(@Body() dto: CreateBiometricCredentialDto, @Req() req: any) {
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

    if (!employee) {
      throw new NotFoundException('Trabajador no encontrado');
    }

    if (employee.status !== 'ACTIVE') {
      throw new BadRequestException(
        'No se puede enrolar un trabajador inactivo',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const credential = await tx.biometricCredential.create({
          data: {
            employeeId: employee.id,
            deviceTemplateId: dto.deviceTemplateId.trim(),
            enrolledBy: req.user.sub,
            active: true,
          },
          select: {
            id: true,
            employeeId: true,
            deviceTemplateId: true,
            active: true,
            enrolledBy: true,
            enrolledAt: true,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: req.user.sub,
            action: 'BIOMETRIC_CREDENTIAL_CREATED',
            entityType: 'BiometricCredential',
            entityId: credential.id,
            reason: 'Credencial biométrica vinculada por un administrador autorizado.',
            afterJson: {
              employeeId: employee.id,
              rut: employee.rut,
              deviceTemplateId: credential.deviceTemplateId,
            },
          },
        });

        return credential;
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Este identificador de plantilla ya está registrado',
        );
      }
      throw error;
    }
  }

  @Patch(':id/revoke')
  @RequirePermissions('biometrics.manage')
  async revoke(@Param('id') id: string, @Req() req: any) {
    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.biometricCredential.findUnique({
        where: { id },
      });

      if (!credential) {
        throw new NotFoundException('Credencial biométrica no encontrada');
      }

      if (!credential.active || credential.revokedAt) {
        throw new BadRequestException('La credencial ya está revocada');
      }

      const updated = await tx.biometricCredential.update({
        where: { id },
        data: {
          active: false,
          revokedAt: new Date(),
        },
        select: {
          id: true,
          employeeId: true,
          deviceTemplateId: true,
          active: true,
          enrolledBy: true,
          enrolledAt: true,
          revokedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.sub,
          action: 'BIOMETRIC_CREDENTIAL_REVOKED',
          entityType: 'BiometricCredential',
          entityId: credential.id,
          reason: 'Credencial biométrica revocada por un administrador autorizado.',
          beforeJson: {
            active: credential.active,
            revokedAt: null,
          },
          afterJson: {
            active: updated.active,
            revokedAt: updated.revokedAt?.toISOString() ?? null,
            employeeId: updated.employeeId,
            deviceTemplateId: updated.deviceTemplateId,
          },
        },
      });

      return updated;
    });
  }
}
