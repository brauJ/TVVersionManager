import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
export declare class AuthService {
    private prisma;
    private jwt;
    constructor(prisma: PrismaService, jwt: JwtService);
    login(email: string, password: string): Promise<{
        accessToken: string;
        user: {
            id: string;
            email: string;
            fullName: string;
            isSuperAdmin: boolean;
            permissions: string[];
        };
    }>;
}
