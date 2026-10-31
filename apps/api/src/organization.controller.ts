import {
  Body, Controller, Get, Post, Patch, Param, Req, UseGuards,
  BadRequestException, NotFoundException
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean, IsOptional, IsString, MinLength, MaxLength
} from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';

class CreateDepartmentDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
}
class UpdateDepartmentDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
}
class SetActiveDto {
  @IsBoolean() active!: boolean;
}
class CreateBranchDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string | null;
}
class UpdateBranchDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string | null;
}

@ApiTags('organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class OrganizationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('departments')
  @RequirePermissions('employees.read')
  departments() {
    return this.prisma.department.findMany({
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' }
    });
  }

  @Post('departments')
  @RequirePermissions('employees.write')
  async createDepartment(@Body() dto: CreateDepartmentDto, @Req() req: any) {
    const name = dto.name.trim();
    try {
      return await this.prisma.$transaction(async tx => {
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
    } catch (error: any) {
      if (error?.code === 'P2002') throw new BadRequestException('Ese departamento ya existe');
      throw error;
    }
  }

  @Patch('departments/:id')
  @RequirePermissions('employees.write')
  async updateDepartment(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @Req() req: any
  ) {
    const before = await this.prisma.department.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Departamento no encontrado');

    try {
      return await this.prisma.$transaction(async tx => {
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
    } catch (error: any) {
      if (error?.code === 'P2002') throw new BadRequestException('Ya existe un departamento con ese nombre');
      throw error;
    }
  }

  @Patch('departments/:id/status')
  @RequirePermissions('employees.write')
  async setDepartmentStatus(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @Req() req: any
  ) {
    const before = await this.prisma.department.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Departamento no encontrado');

    return this.prisma.$transaction(async tx => {
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

  @Get('branches')
  @RequirePermissions('employees.read')
  branches() {
    return this.prisma.branch.findMany({
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' }
    });
  }

  @Post('branches')
  @RequirePermissions('employees.write')
  async createBranch(@Body() dto: CreateBranchDto, @Req() req: any) {
    try {
      return await this.prisma.$transaction(async tx => {
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
    } catch (error: any) {
      if (error?.code === 'P2002') throw new BadRequestException('Esa sucursal ya existe');
      throw error;
    }
  }

  @Patch('branches/:id')
  @RequirePermissions('employees.write')
  async updateBranch(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @Req() req: any
  ) {
    const before = await this.prisma.branch.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Sucursal no encontrada');

    try {
      return await this.prisma.$transaction(async tx => {
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
    } catch (error: any) {
      if (error?.code === 'P2002') throw new BadRequestException('Ya existe una sucursal con ese nombre');
      throw error;
    }
  }

  @Patch('branches/:id/status')
  @RequirePermissions('employees.write')
  async setBranchStatus(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @Req() req: any
  ) {
    const before = await this.prisma.branch.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Sucursal no encontrada');

    return this.prisma.$transaction(async tx => {
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
}
