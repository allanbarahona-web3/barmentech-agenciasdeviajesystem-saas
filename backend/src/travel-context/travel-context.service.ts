import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InternalBookingsService } from '../internal-tourism/internal-bookings.service';
import { TravelPackagesService } from '../travel-packages/travel-packages.service';
import {
  TravelContextDto,
  TravelContextType,
} from './dto/travel-context.dto';

@Injectable()
export class TravelContextService {
  constructor(
    private readonly travelPackagesService: TravelPackagesService,
    private readonly internalBookingsService: InternalBookingsService,
  ) {}

  async getTravelContext(
    tenantId: string,
    travelType: TravelContextType,
    travelId: string,
  ): Promise<TravelContextDto> {
    let context: TravelContextDto | null;

    switch (travelType) {
      case TravelContextType.INTERNATIONAL:
        context = await this.travelPackagesService.getTravelContext(
          tenantId,
          travelId,
        );
        break;
      case TravelContextType.INTERNAL:
        context = await this.internalBookingsService.getTravelContext(
          tenantId,
          travelId,
        );
        break;
      default:
        throw new BadRequestException('Invalid travel type');
    }

    if (context) {
      return context;
    }

    throw new NotFoundException('Travel context not found');
  }
}
