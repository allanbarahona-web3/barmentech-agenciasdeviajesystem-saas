import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantService } from './tenant.service';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * 🏢 Tenant Controller
 * 
 * Permite a los ADMIN de un tenant configurar su propio tenant:
 * - Subir logo y firma
 * - Configurar colores de marca
 * - Actualizar datos legales del representante
 */
@Controller('tenant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * 📋 GET /tenant/config
   * Obtener la configuración actual del tenant
   */
  @Get('config')
  async getTenantConfig(@Req() req: { user: { tenantId: string } }) {
    return this.tenantService.getTenantConfig(req.user.tenantId);
  }

  /**
   * 🎨 PATCH /tenant/config
   * Actualizar colores y datos legales del tenant
   */
  @Patch('config')
  async updateTenantConfig(
    @Req() req: { user: { tenantId: string } },
    @Body() dto: UpdateTenantConfigDto,
  ) {
    return this.tenantService.updateTenantConfig(req.user.tenantId, dto);
  }

  /**
   * 🖼️ POST /tenant/assets/logo
   * Subir logo del tenant
   */
  @Post('assets/logo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @Req() req: { user: { tenantId: string } },
    @UploadedFile() file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    return this.tenantService.uploadTenantAsset(
      req.user.tenantId,
      'logo',
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
      },
    );
  }

  /**
   * ✍️ POST /tenant/assets/signature
   * Subir firma del tenant
   */
  @Post('assets/signature')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSignature(
    @Req() req: { user: { tenantId: string } },
    @UploadedFile() file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    return this.tenantService.uploadTenantAsset(
      req.user.tenantId,
      'signature',
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
      },
    );
  }

  /**
   * 🗑️ DELETE /tenant/assets/logo
   * Eliminar logo del tenant
   */
  @Delete('assets/logo')
  async deleteLogo(@Req() req: { user: { tenantId: string } }) {
    return this.tenantService.deleteTenantAsset(req.user.tenantId, 'logo');
  }

  /**
   * 🗑️ DELETE /tenant/assets/signature
   * Eliminar firma del tenant
   */
  @Delete('assets/signature')
  async deleteSignature(@Req() req: { user: { tenantId: string } }) {
    return this.tenantService.deleteTenantAsset(req.user.tenantId, 'signature');
  }
}
