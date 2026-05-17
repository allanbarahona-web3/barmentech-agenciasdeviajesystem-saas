import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtModuleOptions } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn = configService.get<string>("JWT_EXPIRES_IN", "12h");
        return {
          secret: configService.get<string>("JWT_SECRET", "dev-secret"),
          signOptions: {
            // Type assertion needed for NestJS v11 compatibility with zeit/ms string format
            expiresIn: expiresIn as any,
          },
        };
      },
    }),
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
