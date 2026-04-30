import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TravelPackagesService } from './travel-packages.service';
import { CreateTravelPackageDto } from './dto/create-travel-package.dto';
import { UpdateTravelPackageDto } from './dto/update-travel-package.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('travel-packages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TravelPackagesController {
  constructor(private readonly travelPackagesService: TravelPackagesService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateTravelPackageDto, @Request() req: any) {
    return this.travelPackagesService.create(dto, req.user.id);
  }

  @Get()
  @Roles('ADMIN', 'AGENT', 'OPERATIONS')
  findAll() {
    return this.travelPackagesService.findAll();
  }

  @Get('available')
  @Roles('AGENT', 'OPERATIONS')
  findAvailable() {
    return this.travelPackagesService.findAvailable();
  }

  @Get('code/:packageCode')
  @Roles('ADMIN', 'AGENT', 'OPERATIONS')
  findByCode(@Param('packageCode') packageCode: string) {
    return this.travelPackagesService.findByCode(packageCode);
  }

  @Get(':id')
  @Roles('ADMIN', 'AGENT', 'OPERATIONS')
  findById(@Param('id') id: string) {
    return this.travelPackagesService.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTravelPackageDto,
  ) {
    return this.travelPackagesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  delete(@Param('id') id: string) {
    return this.travelPackagesService.delete(id);
  }
}
