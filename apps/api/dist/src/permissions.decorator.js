"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuperAdminOnly = exports.RequirePermissions = void 0;
const common_1 = require("@nestjs/common");
const permissions_guard_1 = require("./permissions.guard");
const RequirePermissions = (...permissions) => (0, common_1.SetMetadata)(permissions_guard_1.REQUIRED_PERMISSIONS, permissions);
exports.RequirePermissions = RequirePermissions;
const SuperAdminOnly = () => (0, common_1.SetMetadata)(permissions_guard_1.SUPER_ADMIN_ONLY, true);
exports.SuperAdminOnly = SuperAdminOnly;
//# sourceMappingURL=permissions.decorator.js.map