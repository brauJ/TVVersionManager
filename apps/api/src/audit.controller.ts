import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private prisma: PrismaService) {}
  @Get()
  @RequirePermissions('audit.read')
  list(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    return this.prisma.auditLog.findMany({
      where: { ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) },
      orderBy: { createdAt: 'desc' }, take: 500
    });
  }
}
