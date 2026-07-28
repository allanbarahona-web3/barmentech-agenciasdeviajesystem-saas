import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateSupplierDto, UpdateSupplierDto } from "./dto";
import { AdditionalServicesService } from "./additional-services.service";

type AdminRequest = {
  user: {
    tenantId: string;
  };
};

@Controller("additional-services/suppliers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdditionalServiceSuppliersController {
  constructor(
    private readonly additionalServicesService: AdditionalServicesService,
  ) {}

  @Get()
  list(@Req() req: AdminRequest) {
    return this.additionalServicesService.listSuppliers(req.user.tenantId);
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
