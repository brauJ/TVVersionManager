"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const argon2 = require("argon2");
const prisma = new client_1.PrismaClient();
async function main() {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password || password.includes('REPLACE_WITH')) {
        throw new Error('Configura SEED_ADMIN_EMAIL y una SEED_ADMIN_PASSWORD fuerte antes del seed.');
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, passwordHash, fullName: 'Administrador principal', isSuperAdmin: true }
    });
    const permissions = [
        ['employees.read', 'Consultar trabajadores'],
        ['employees.write', 'Crear y editar trabajadores'],
        ['shifts.manage', 'Gestionar turnos'],
        ['attendance.read', 'Consultar marcaciones'],
        ['attendance.manual', 'Añadir marcaciones manuales'],
        ['attendance.review', 'Revisar y anular marcaciones pendientes'],
        ['reports.export', 'Exportar informes'],
        ['audit.read', 'Consultar auditoría'],
        ['biometrics.manage', 'Gestionar credenciales biométricas'],
        ['users.manage', 'Administrar usuarios y permisos']
    ];
    for (const [code, description] of permissions) {
        await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description } });
    }
}
main().finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map