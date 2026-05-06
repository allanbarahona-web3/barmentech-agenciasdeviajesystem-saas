import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET", "dev-secret"),
    });
  }

  async validate(payload: { sub: string; email: string; jti?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        activeJti: true,
        tenantId: true,
      },
    });

    // User doesn't exist
    if (!user) {
      throw new UnauthorizedException("Usuario no autorizado");
    }

    // User is suspended - specific message for this case
    if (!user.isActive) {
      throw new UnauthorizedException("Tu usuario ha sido suspendido. Contacta al administrador.");
    }

    // Session invalidated (role change, explicit logout, etc.)
    if (!payload.jti || !user.activeJti || payload.jti !== user.activeJti) {
      throw new UnauthorizedException("Sesion invalida o reemplazada por otro inicio de sesion");
    }

    return user;
  }
}
