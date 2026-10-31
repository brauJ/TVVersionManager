import { PrismaService } from './prisma.service';
export declare class AuditController {
    private prisma;
    constructor(prisma: PrismaService);
    list(entityType?: string, entityId?: string): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        userId: string | null;
        action: string;
        entityType: string;
        entityId: string | null;
        beforeJson: import("@prisma/client/runtime/library").JsonValue | null;
        afterJson: import("@prisma/client/runtime/library").JsonValue | null;
        reason: string | null;
        requestId: string | null;
    }[]>;
}
