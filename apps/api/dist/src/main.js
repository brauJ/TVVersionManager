"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const helmet_1 = require("helmet");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api');
    app.use((0, helmet_1.default)());
    app.enableCors({
        origin: (process.env.WEB_ORIGIN || 'http://localhost:5173').split(','),
        credentials: true
    });
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const swagger = new swagger_1.DocumentBuilder().setTitle('Asistencia API').setDescription('API del sistema de asistencia').setVersion('0.1.0').addBearerAuth().build();
    swagger_1.SwaggerModule.setup('api/docs', app, swagger_1.SwaggerModule.createDocument(app, swagger));
    await app.listen(Number(process.env.API_PORT || 3000), '0.0.0.0');
}
bootstrap();
//# sourceMappingURL=main.js.map