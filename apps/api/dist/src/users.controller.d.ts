import { PrismaService } from './prisma.service';
declare class CreateUserDto {
    email: string;
    password: string;
    fullName: string;
    permissionCodes?: string[];
}
declare class UpdateUserDto {
    email?: string;
    fullName?: string;
    password?: string;
}
declare class UpdateStatusDto {
    status: 'ACTIVE' | 'DISABLED';
}
declare class UpdatePermissionsDto {
    permissionCodes: string[];
}
export declare class UsersController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(): Promise<{
        permissions: {
            code: string;
            description: string;
        }[];
        id: string;
        email: string;
        fullName: string;
        status: import(".prisma/client").$Enums.UserStatus;
        isSuperAdmin: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    listPermissions(): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        code: string;
        description: string;
    }[]>;
    create(dto: CreateUserDto, req: any): Promise<{
        permissions: string[];
        id: string;
        email: string;
        fullName: string;
        status: import(".prisma/client").$Enums.UserStatus;
        isSuperAdmin: boolean;
        createdAt: Date;
    }>;
    update(id: string, dto: UpdateUserDto, req: any): Promise<{
        id: string;
        email: string;
        fullName: string;
        status: import(".prisma/client").$Enums.UserStatus;
        isSuperAdmin: boolean;
        updatedAt: Date;
    }>;
    updateStatus(id: string, dto: UpdateStatusDto, req: any): Promise<{
        id: string;
        email: string;
        fullName: string;
        status: import(".prisma/client").$Enums.UserStatus;
        isSuperAdmin: boolean;
    }>;
    updatePermissions(id: string, dto: UpdatePermissionsDto, req: any): Promise<{
        userId: string;
        email: string;
        permissions: string[];
    }>;
    private resolvePermissions;
}
export {};
