import { PrismaService } from './prisma.service';
declare class CreateDepartmentDto {
    name: string;
}
declare class UpdateDepartmentDto {
    name: string;
}
declare class SetActiveDto {
    active: boolean;
}
declare class CreateBranchDto {
    name: string;
    address?: string | null;
}
declare class UpdateBranchDto {
    name: string;
    address?: string | null;
}
export declare class OrganizationController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    departments(): import(".prisma/client").Prisma.PrismaPromise<({
        _count: {
            employees: number;
        };
    } & {
        id: string;
        name: string;
        active: boolean;
    })[]>;
    createDepartment(dto: CreateDepartmentDto, req: any): Promise<{
        id: string;
        name: string;
        active: boolean;
    }>;
    updateDepartment(id: string, dto: UpdateDepartmentDto, req: any): Promise<{
        id: string;
        name: string;
        active: boolean;
    }>;
    setDepartmentStatus(id: string, dto: SetActiveDto, req: any): Promise<{
        message: string;
        department: {
            id: string;
            name: string;
            active: boolean;
        };
    }>;
    branches(): import(".prisma/client").Prisma.PrismaPromise<({
        _count: {
            employees: number;
        };
    } & {
        id: string;
        name: string;
        active: boolean;
        address: string | null;
    })[]>;
    createBranch(dto: CreateBranchDto, req: any): Promise<{
        id: string;
        name: string;
        active: boolean;
        address: string | null;
    }>;
    updateBranch(id: string, dto: UpdateBranchDto, req: any): Promise<{
        id: string;
        name: string;
        active: boolean;
        address: string | null;
    }>;
    setBranchStatus(id: string, dto: SetActiveDto, req: any): Promise<{
        message: string;
        branch: {
            id: string;
            name: string;
            active: boolean;
            address: string | null;
        };
    }>;
}
export {};
