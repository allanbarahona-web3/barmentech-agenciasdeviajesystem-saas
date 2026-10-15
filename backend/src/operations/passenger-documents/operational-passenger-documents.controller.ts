import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { OperationalPassengerDocumentsService } from "./operational-passenger-documents.service";

type OperationsRequest = { user: { tenantId: string } };

@Controller("operations/requirements")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES)
export class OperationalPassengerDocumentsController {
  constructor(private readonly service: OperationalPassengerDocumentsService) {}

  @Get(":requirementId/passenger-documents")
  list(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string) {
    return this.service.list(request.user.tenantId, requirementId);
  }

  @Get(":requirementId/passenger-documents/:documentId/url")
  signedUrl(
    @Req() request: OperationsRequest,
    @Param("requirementId") requirementId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.service.getSignedUrl(request.user.tenantId, requirementId, documentId);
  }
}
