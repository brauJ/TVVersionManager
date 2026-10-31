import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
declare class CreateEmployeeDto {
    rut: string;
    firstName: string;
    lastName: string;
    position?: string | null;
    departmentId?: string | null;
    branchId?: string | null;
    hiredAt?: string | null;
    status?: EmployeeStatus;
}
declare class UpdateEmployeeDto {
    rut?: string;
    firstName?: string;
    lastName?: string;
    position?: string | null;
    departmentId?: string | null;
    branchId?: string | null;
    hiredAt?: string | null;
    status?: EmployeeStatus;
}
export declare class EmployeesController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private validateActiveAssignments;
    list(q?: string, status?: string): import(".prisma/client").Prisma.PrismaPromise<({
        department: {
            id: string;
            name: string;
            active: boolean;
        } | null;
        branch: {
            id: string;
            name: string;
            active: boolean;
            address: string | null;
        } | null;
    } & {
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
    })[]>;
    getOne(id: string): Promise<{
        department: {
            id: string;
            name: string;
            active: boolean;
        } | null;
        branch: {
            id: string;
            name: string;
            active: boolean;
            address: string | null;
        } | null;
        shiftAssignments: ({
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
        } & {
            id: string;
            validFrom: Date;
            employeeId: string;
            shiftId: string;
            validTo: Date | null;
        })[];
    } & {
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
    }>;
    create(dto: CreateEmployeeDto, req: any): Promise<{
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
    }>;
    update(id: string, dto: UpdateEmployeeDto, req: any): Promise<{
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
    }>;
    deactivate(id: string, req: any): Promise<{
        message: string;
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
    }>;
    activate(id: string, req: any): Promise<{
        message: string;
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
    }>;
}
export {};
