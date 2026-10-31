"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const throttler_1 = require("@nestjs/throttler");
const prisma_service_1 = require("./prisma.service");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const employees_controller_1 = require("./employees.controller");
const attendance_controller_1 = require("./attendance.controller");
const audit_controller_1 = require("./audit.controller");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const organization_controller_1 = require("./organization.controller");
const shifts_controller_1 = require("./shifts.controller");
const users_controller_1 = require("./users.controller");
const permissions_guard_1 = require("./permissions.guard");
const biometric_device_controller_1 = require("./biometric-device.controller");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule.forRoot({ isGlobal: true }), jwt_1.JwtModule.register({}), throttler_1.ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
        controllers: [auth_controller_1.AuthController, employees_controller_1.EmployeesController, attendance_controller_1.AttendanceController, audit_controller_1.AuditController, organization_controller_1.OrganizationController, shifts_controller_1.ShiftsController, users_controller_1.UsersController, biometric_device_controller_1.BiometricDeviceController],
        providers: [prisma_service_1.PrismaService, auth_service_1.AuthService, jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard]
    })
], AppModule);
//# sourceMappingURL=app.module.js.map