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
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import * as argon2 from 'argon2';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { SuperAdminOnly } from './permissions.decorator';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
  @IsString() @MinLength(2) fullName!: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) permissionCodes?: string[];
}

class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsString() @MinLength(12) password?: string;
}

class UpdateStatusDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED';
}

class UpdatePermissionsDto {
  @IsArray() @ArrayUnique() @IsString({ each: true }) permissionCodes!: string[];
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@SuperAdminOnly()
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
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

  @Get('permissions')
  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: any) {
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
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ya existe un usuario con ese correo');
      throw error;
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, isSuperAdmin: true },
    });
    if (!before) throw new NotFoundException('Usuario no encontrado');

    const data: { email?: string; fullName?: string; passwordHash?: string } = {};
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.password !== undefined) data.passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

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
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ya existe un usuario con ese correo');
      throw error;
    }
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Req() req: any) {
    if (id === req.user.sub && dto.status === 'DISABLED') {
      throw new BadRequestException('No puedes desactivar tu propia cuenta');
    }
    const before = await this.prisma.user.findUnique({
      where: { id }, select: { id: true, status: true, isSuperAdmin: true },
    });
    if (!before) throw new NotFoundException('Usuario no encontrado');

    if (before.isSuperAdmin && dto.status === 'DISABLED') {
      const activeSuperAdmins = await this.prisma.user.count({
        where: { isSuperAdmin: true, status: 'ACTIVE' },
      });
      if (activeSuperAdmins <= 1) throw new BadRequestException('No puedes desactivar al último superadministrador activo');
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

  @Patch(':id/permissions')
  async updatePermissions(@Param('id') id: string, @Body() dto: UpdatePermissionsDto, @Req() req: any) {
    const target = await this.prisma.user.findUnique({
      where: { id }, select: { id: true, email: true, isSuperAdmin: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

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

  private async resolvePermissions(codes: string[]) {
    const uniqueCodes = [...new Set(codes)];
    const permissions = uniqueCodes.length
      ? await this.prisma.permission.findMany({ where: { code: { in: uniqueCodes } } })
      : [];
    if (permissions.length !== uniqueCodes.length) {
      const found = new Set(permissions.map((permission) => permission.code));
      const missing = uniqueCodes.filter((code) => !found.has(code));
      throw new BadRequestException(`Permisos desconocidos: ${missing.join(', ')}`);
    }
    return permissions;
  }
}
