import { ShiftMode } from '@prisma/client';
import { PrismaService } from './prisma.service';
declare class CreateShiftDto {
    name: string;
    startTime: string;
    endTime: string;
    breakStart?: string;
    breakEnd?: string;
    toleranceMinutes?: number;
    mode?: ShiftMode;
    crossesMidnight?: boolean;
}
declare class CloseAssignmentDto {
    validTo: string;
}
declare class AssignShiftDto {
    employeeId: string;
    validFrom: string;
    validTo?: string;
}
export declare class ShiftsController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(): import(".prisma/client").Prisma.PrismaPromise<({
        assignments: ({
            employee: {
                id: string;
                status: import(".prisma/client").$Enums.EmployeeStatus;
                rut: string;
                firstName: string;
                lastName: string;
            };
        } & {
            id: string;
            validFrom: Date;
            employeeId: string;
            shiftId: string;
            validTo: Date | null;
        })[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        startTime: string;
        endTime: string;
        breakStart: string | null;
        breakEnd: string | null;
        toleranceMinutes: number;
        mode: import(".prisma/client").$Enums.ShiftMode;
        crossesMidnight: boolean;
    })[]>;
    create(dto: CreateShiftDto, req: any): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        startTime: string;
        endTime: string;
        breakStart: string | null;
        breakEnd: string | null;
        toleranceMinutes: number;
        mode: import(".prisma/client").$Enums.ShiftMode;
        crossesMidnight: boolean;
    }>;
    assign(shiftId: string, dto: AssignShiftDto, req: any): Promise<{
        id: string;
        validFrom: Date;
        employeeId: string;
        shiftId: string;
        validTo: Date | null;
    }>;
    closeAssignment(shiftId: string, assignmentId: string, dto: CloseAssignmentDto, req: any): Promise<{
        message: string;
        assignment: {
            id: string;
            validFrom: Date;
            employeeId: string;
            shiftId: string;
            validTo: Date | null;
        };
    }>;
    setShiftStatus(shiftId: string, body: {
        active: boolean;
    }, req: any): Promise<{
        message: string;
        shift: {
            id: string;
            createdAt: Date;
            name: string;
            active: boolean;
            startTime: string;
            endTime: string;
            breakStart: string | null;
            breakEnd: string | null;
            toleranceMinutes: number;
            mode: import(".prisma/client").$Enums.ShiftMode;
            crossesMidnight: boolean;
        };
    }>;
}
export {};
