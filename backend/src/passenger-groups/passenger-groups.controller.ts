import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreatePassengerGroupDto,
  PassengerGroupMembersDto,
  UpdatePassengerGroupDto,
} from "./dto/passenger-group.dto";
import { PassengerGroupsService } from "./passenger-groups.service";

type PassengerGroupsRequest = {
  user: { id: string; fullName: string; tenantId: string };
};

@Controller("travel-packages/:travelPackageId/passenger-groups")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES)
export class PassengerGroupsController {
  constructor(private readonly service: PassengerGroupsService) {}

  @Get()
  list(
    @Req() request: PassengerGroupsRequest,
    @Param("travelPackageId") travelPackageId: string,
  ) {
    return this.service.list(request.user.tenantId, travelPackageId);
  }

  @Post()
  create(
    @Req() request: PassengerGroupsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Body() body: CreatePassengerGroupDto,
  ) {
    return this.service.create(request.user.tenantId, travelPackageId, body, actor(request));
  }

  @Get(":groupId")
  find(
    @Req() request: PassengerGroupsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("groupId") groupId: string,
  ) {
    return this.service.find(request.user.tenantId, travelPackageId, groupId);
  }

  @Patch(":groupId")
  update(
    @Req() request: PassengerGroupsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("groupId") groupId: string,
    @Body() body: UpdatePassengerGroupDto,
  ) {
    return this.service.update(
      request.user.tenantId,
      travelPackageId,
      groupId,
      body,
      actor(request),
    );
  }

  @Post(":groupId/archive")
  archive(
    @Req() request: PassengerGroupsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("groupId") groupId: string,
  ) {
    return this.service.archive(request.user.tenantId, travelPackageId, groupId, actor(request));
  }

  @Post(":groupId/members")
  addMembers(
    @Req() request: PassengerGroupsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("groupId") groupId: string,
    @Body() body: PassengerGroupMembersDto,
  ) {
    return this.service.addMembers(
      request.user.tenantId,
      travelPackageId,
      groupId,
      body,
      actor(request),
    );
  }

  @Delete(":groupId/members")
  removeMembers(
    @Req() request: PassengerGroupsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("groupId") groupId: string,
    @Body() body: PassengerGroupMembersDto,
  ) {
    return this.service.removeMembers(request.user.tenantId, travelPackageId, groupId, body);
  }
}

function actor(request: PassengerGroupsRequest) {
  return { userId: request.user.id, name: request.user.fullName };
}
