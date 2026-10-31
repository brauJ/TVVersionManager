import { PrismaService } from './prisma.service';
declare class ReviewAttendanceDto {
    status: 'CONFIRMED' | 'VOIDED';
    reason: string;
}
declare class ManualAttendanceDto {
    employeeId: string;
    type: 'ENTRY' | 'BREAK_START' | 'BREAK_END' | 'EXIT';
    occurredAt: string;
    reason: string;
}
export declare class AttendanceController {
    private prisma;
    constructor(prisma: PrismaService);
    list(from?: string, to?: string, employeeId?: string): Promise<{
        creator: {
            id: string;
            email: string;
            fullName: string;
        } | null;
        auditTrail: {
            action: string;
            reason: string | null;
            createdAt: Date;
            user: {
                id: string;
                email: string;
                fullName: string;
            } | null;
        }[];
        employee: {
            id: string;
            status: import(".prisma/client").$Enums.EmployeeStatus;
            createdAt: Date;
            updatedAt: Date;
            rut: string;
            firstName: string;
            lastName: string;
            position: string | null;
            departmentId: string | null;
            branchId: string | null;
            hiredAt: Date | null;
        };
        type: import(".prisma/client").$Enums.AttendanceType;
        id: string;
        status: import(".prisma/client").$Enums.AttendanceStatus;
        createdAt: Date;
        employeeId: string;
        occurredAt: Date;
        eventId: string;
        sessionId: string | null;
        method: import(".prisma/client").$Enums.AttendanceMethod;
        receivedAt: Date;
        deviceId: string | null;
        manualReason: string | null;
        createdByUserId: string | null;
    }[]>;
    review(id: string, dto: ReviewAttendanceDto, req: any): Promise<({
        employee: {
            id: string;
            status: import(".prisma/client").$Enums.EmployeeStatus;
            createdAt: Date;
            updatedAt: Date;
            rut: string;
            firstName: string;
            lastName: string;
            position: string | null;
            departmentId: string | null;
            branchId: string | null;
            hiredAt: Date | null;
        };
    } & {
        type: import(".prisma/client").$Enums.AttendanceType;
        id: string;
        status: import(".prisma/client").$Enums.AttendanceStatus;
        createdAt: Date;
        employeeId: string;
        occurredAt: Date;
        eventId: string;
        sessionId: string | null;
        method: import(".prisma/client").$Enums.AttendanceMethod;
        receivedAt: Date;
        deviceId: string | null;
        manualReason: string | null;
        createdByUserId: string | null;
    }) | null>;
    manual(dto: ManualAttendanceDto, req: any): Promise<{
        type: import(".prisma/client").$Enums.AttendanceType;
        id: string;
        status: import(".prisma/client").$Enums.AttendanceStatus;
        createdAt: Date;
        employeeId: string;
        occurredAt: Date;
        eventId: string;
        sessionId: string | null;
        method: import(".prisma/client").$Enums.AttendanceMethod;
        receivedAt: Date;
        deviceId: string | null;
        manualReason: string | null;
        createdByUserId: string | null;
    }>;
}
export {};
