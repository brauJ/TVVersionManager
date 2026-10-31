import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmployeesController } from './employees.controller';
import { AttendanceController } from './attendance.controller';
import { AuditController } from './audit.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OrganizationController } from './organization.controller';
import { ShiftsController } from './shifts.controller';
import { UsersController } from './users.controller';
import { PermissionsGuard } from './permissions.guard';
import { BiometricDeviceController } from './biometric-device.controller';
import { BiometricCredentialsController } from './biometric-credentials.controller';
import { OvertimeController } from './overtime.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({}), ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
  controllers: [AuthController, EmployeesController, AttendanceController, AuditController, OrganizationController, ShiftsController, UsersController, BiometricDeviceController, BiometricCredentialsController, OvertimeController,],
  providers: [PrismaService, AuthService, JwtAuthGuard, PermissionsGuard]
})
export class AppModule {}
