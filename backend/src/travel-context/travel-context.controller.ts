import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Tenant } from '../tenant/tenant.decorator';
import { ResolvedTenant } from '../tenant/tenant.service';
import { TravelContextService } from './travel-context.service';
import { TravelContextType } from './dto/travel-context.dto';

@Controller('travel-context')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'AGENT', 'OPERACIONES')
export class TravelContextController {
  constructor(private readonly travelContextService: TravelContextService) {}

  @Get(':travelType/:travelId')
  getTravelContext(
    @Param('travelType', new ParseEnumPipe(TravelContextType))
    travelType: TravelContextType,
    @Param('travelId') travelId: string,
    @Tenant() tenant: ResolvedTenant,
  ) {
    return this.travelContextService.getTravelContext(
      tenant.id,
      travelType,
      travelId,
    );
  }
}
