import { PrismaService } from './prisma.service';
declare class BiometricPunchDto {
    eventId: string;
    deviceTemplateId: string;
    occurredAt: string;
}
export declare class BiometricDeviceController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private verifySecret;
    private authenticate;
    punch(deviceId: string | undefined, secret: string | undefined, dto: BiometricPunchDto): Promise<{
        ok: boolean;
        duplicate: boolean;
        eventId: string;
        result: string;
        message?: undefined;
        type?: undefined;
        attendanceRecordId?: undefined;
    } | {
        ok: boolean;
        eventId: string;
        result: string;
        message: string;
        duplicate?: undefined;
        type?: undefined;
        attendanceRecordId?: undefined;
    } | {
        ok: boolean;
        eventId: string;
        result: string;
        type: "ENTRY" | "BREAK_START" | "BREAK_END" | "EXIT";
        attendanceRecordId: string;
        duplicate?: undefined;
        message?: undefined;
    }>;
    status(deviceId: string | undefined, secret: string | undefined): Promise<{
        ok: boolean;
        deviceId: string;
        status: string;
    }>;
}
export {};
