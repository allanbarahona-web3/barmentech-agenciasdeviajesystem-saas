import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TravelPackagesService } from './travel-packages.service';
import { CreateTravelPackageDto } from './dto/create-travel-package.dto';
import { UpdateTravelPackageDto } from './dto/update-travel-package.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { PassengerGroupsService } from '../passenger-groups/passenger-groups.service';
import { ListGroupingTravelPackagesDto } from '../passenger-groups/dto/list-grouping-travel-packages.dto';

@Controller('travel-packages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TravelPackagesController {
  constructor(
    private readonly travelPackagesService: TravelPackagesService,
    private readonly passengerGroupsService: PassengerGroupsService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateTravelPackageDto, @Request() req: any) {
    return this.travelPackagesService.create(dto, req.user.id, req.user.tenantId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES)
  findAll(
    @Query('travelType') travelType: string | undefined,
    @Request() req: any,
  ) {
    return this.travelPackagesService.findAll(req.user.tenantId, travelType);
  }

  @Get('available')
  @Roles(UserRole.AGENT, UserRole.OPERACIONES)
  findAvailable(
    @Query('travelType') travelType: string | undefined,
    @Request() req: any,
  ) {
    return this.travelPackagesService.findAvailable(req.user.tenantId, travelType);
  }

  @Get('client/:clientId/active')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES)
  findActiveByClient(
    @Param('clientId') clientId: string,
    @Request() req: any,
  ) {
    return this.travelPackagesService.getActiveTravelPackagesByClient(
      req.user.tenantId,
      clientId,
    );
  }

  @Get('code/:packageCode')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES)
  findByCode(
    @Param('packageCode') packageCode: string,
    @Request() req: any,
  ) {
    return this.travelPackagesService.findByCode(packageCode, req.user.tenantId);
  }

  @Get('grouping-summaries')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES)
  groupingSummaries(
    @Query() query: ListGroupingTravelPackagesDto,
    @Request() req: any,
  ) {
    return this.passengerGroupsService.listTravelPackageSummaries(
      req.user.tenantId,
      query,
    );
  }

  @Get(':id/participants')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES)
  async participants(@Param('id') id: string, @Request() req: any) {
    await this.travelPackagesService.findById(id, req.user.tenantId);
    return this.travelPackagesService.getParticipantRoster(req.user.tenantId, id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES)
  findById(@Param('id') id: string, @Request() req: any) {
    return this.travelPackagesService.findById(id, req.user.tenantId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTravelPackageDto,
    @Request() req: any,
  ) {
    return this.travelPackagesService.update(id, dto, req.user.tenantId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  delete(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.travelPackagesService.delete(id, req.user.tenantId);
  }
}
