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
import { ContractNotesService } from '../contracts/notes/contract-notes.service';

@Injectable()
export class TravelContextService {
  constructor(
    private readonly travelPackagesService: TravelPackagesService,
    private readonly internalBookingsService: InternalBookingsService,
    private readonly contractNotesService: ContractNotesService,
  ) {}

  async getTravelContext(
    tenantId: string,
    travelType: TravelContextType,
    travelId: string,
    clientId?: string,
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
      return this.contractNotesService.enrichTravelContext(
        tenantId,
        context,
        clientId,
      );
    }

    throw new NotFoundException('Travel context not found');
  }
}
