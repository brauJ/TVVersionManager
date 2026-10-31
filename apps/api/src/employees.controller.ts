import {
  Body, Controller, Get, Param, Patch, Post, Query, Req,
  UseGuards, BadRequestException, NotFoundException
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsDateString, IsEnum, IsOptional, IsString, MinLength
} from 'class-validator';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';

class CreateEmployeeDto {
  @IsString() @MinLength(3) rut!: string;
  @IsString() @MinLength(1) firstName!: string;
  @IsString() @MinLength(1) lastName!: string;
  @IsOptional() @IsString() position?: string | null;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() branchId?: string | null;
  @IsOptional() @IsDateString() hiredAt?: string | null;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
}

class UpdateEmployeeDto {
  @IsOptional() @IsString() @MinLength(3) rut?: string;
  @IsOptional() @IsString() @MinLength(1) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) lastName?: string;
  @IsOptional() @IsString() position?: string | null;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() branchId?: string | null;
  @IsOptional() @IsDateString() hiredAt?: string | null;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
}

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly prisma: PrismaService) {}

  private async validateActiveAssignments(
    departmentId?: string | null,
    branchId?: string | null
  ): Promise<void> {
    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true, active: true }
      });

      if (!department) {
        throw new BadRequestException('El departamento seleccionado no existe');
      }
      if (!department.active) {
        throw new BadRequestException(
          'No se puede asignar un trabajador a un departamento inactivo'
        );
      }
    }

    if (branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, active: true }
      });

      if (!branch) {
        throw new BadRequestException('La sucursal seleccionada no existe');
      }
      if (!branch.active) {
        throw new BadRequestException(
          'No se puede asignar un trabajador a una sucursal inactiva'
        );
      }
    }
  }

  @Get()
  @RequirePermissions('employees.read')
  list(@Query('q') q?: string, @Query('status') status?: string) {
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
          ? { status: status as EmployeeStatus } : {})
      },
      include: { department: true, branch: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 200
    });
  }

  @Get(':id')
  @RequirePermissions('employees.read')
  async getOne(@Param('id') id: string) {
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

    if (!employee) throw new NotFoundException('Trabajador no encontrado');
    return employee;
  }

  @Post()
  @RequirePermissions('employees.write')
  async create(@Body() dto: CreateEmployeeDto, @Req() req: any) {
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

      return await this.prisma.$transaction(async tx => {
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
    } catch (error: any) {
      if (error?.status) throw error;
      if (error?.code === 'P2002') {
        throw new BadRequestException('Ya existe un trabajador con ese RUT');
      }
      if (error?.code === 'P2003') {
        throw new BadRequestException('El departamento o la sucursal seleccionados no existen');
      }
      throw new BadRequestException('No se pudo crear el trabajador. Revisa los datos.');
    }
  }

  @Patch(':id')
  @RequirePermissions('employees.write')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: any
  ) {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Trabajador no encontrado');

    const data: any = { ...dto };
    if (dto.rut !== undefined) data.rut = dto.rut.trim();
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.position !== undefined) data.position = dto.position?.trim() || null;
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId || null;
    if (dto.branchId !== undefined) data.branchId = dto.branchId || null;
    if (dto.hiredAt !== undefined) {
      data.hiredAt = dto.hiredAt ? new Date(dto.hiredAt) : null;
    }

    try {
      await this.validateActiveAssignments(dto.departmentId, dto.branchId);

      return await this.prisma.$transaction(async tx => {
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
    } catch (error: any) {
      if (error?.status) throw error;
      if (error?.code === 'P2002') {
        throw new BadRequestException('Ya existe un trabajador con ese RUT');
      }
      if (error?.code === 'P2003') {
        throw new BadRequestException('El departamento o la sucursal seleccionados no existen');
      }
      throw new BadRequestException('No se pudo actualizar el trabajador');
    }
  }

  @Post(':id/deactivate')
  @RequirePermissions('employees.write')
  async deactivate(@Param('id') id: string, @Req() req: any) {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Trabajador no encontrado');

    return this.prisma.$transaction(async tx => {
      const employee = await tx.employee.update({
        where: { id },
        data: { status: EmployeeStatus.INACTIVE }
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

  @Post(':id/activate')
  @RequirePermissions('employees.write')
  async activate(@Param('id') id: string, @Req() req: any) {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Trabajador no encontrado');

    return this.prisma.$transaction(async tx => {
      const employee = await tx.employee.update({
        where: { id },
        data: { status: EmployeeStatus.ACTIVE }
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

}
