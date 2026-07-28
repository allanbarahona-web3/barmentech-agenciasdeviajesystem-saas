import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateSupplierDto,
  RequestNewSupplierDto,
  UpdateSupplierDto,
} from "./dto";
import { AdditionalServicesService } from "./additional-services.service";
import { SupplierRequestNotificationService } from "./supplier-request-notification.service";

type AdminRequest = {
  user: {
    tenantId: string;
    role: "ADMIN" | "AGENT" | "OPERACIONES";
    id: string;
    fullName: string;
  };
};

@Controller("additional-services/suppliers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdditionalServiceSuppliersController {
  constructor(
    private readonly additionalServicesService: AdditionalServicesService,
    private readonly supplierRequestNotifications: SupplierRequestNotificationService,
  ) {}

  @Get()
  @Roles("ADMIN", "AGENT", "OPERACIONES")
  list(
    @Req() req: AdminRequest,
    @Query("activeOnly") activeOnly?: string,
    @Query("travelType") travelType?: string,
  ) {
    return this.additionalServicesService.listSuppliers(req.user.tenantId, {
      activeOnly: req.user.role !== "ADMIN" || activeOnly === "true",
      travelType:
        travelType === "INTERNATIONAL" || travelType === "INTERNAL"
          ? travelType
          : undefined,
    });
  }

  @Get(":id")
  getById(@Req() req: AdminRequest, @Param("id") id: string) {
    return this.additionalServicesService.getSupplier(
      req.user.tenantId,
      id,
    );
  }

  @Post()
  create(
    @Req() req: AdminRequest,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.additionalServicesService.createSupplier(
      req.user.tenantId,
      dto,
    );
  }

  @Post("requests")
  @Roles("ADMIN", "AGENT", "OPERACIONES")
  async requestNewSupplier(
    @Req() req: AdminRequest,
    @Body() dto: RequestNewSupplierDto,
  ) {
    await this.supplierRequestNotifications.notifyAdministration({
      tenantId: req.user.tenantId,
      requestedBy: {
        id: req.user.id,
        name: req.user.fullName,
      },
      supplierName: dto.supplierName.trim(),
      website: dto.website?.trim() || null,
      notes: dto.notes?.trim() || null,
      travelType: dto.travelType,
      additionalService: dto.additionalService.trim(),
      orderId: dto.orderId?.trim() || null,
    });

    return { notificationQueued: true };
  }

  @Patch(":id")
  update(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.additionalServicesService.updateSupplier(
      req.user.tenantId,
      id,
      dto,
    );
  }

  @Delete(":id")
  remove(@Req() req: AdminRequest, @Param("id") id: string) {
    return this.additionalServicesService.deleteSupplier(
      req.user.tenantId,
      id,
    );
  }
}
