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

@Controller('travel-packages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TravelPackagesController {
  constructor(private readonly travelPackagesService: TravelPackagesService) {}

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

  @Get('code/:packageCode')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES)
  findByCode(
    @Param('packageCode') packageCode: string,
    @Request() req: any,
  ) {
    return this.travelPackagesService.findByCode(packageCode, req.user.tenantId);
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
