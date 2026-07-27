import { TravelPackageParticipantRoleValue } from '../repositories/travel-package-participants.repository';
import { TravelContextType } from '../../travel-context/dto/travel-context.dto';

export class ClientActiveTravelPackageDto {
  travelId!: string;
  travelType!: TravelContextType.INTERNATIONAL;
  name!: string;
  destination!: string;
  departureDate!: Date;
  returnDate!: Date;
  status!: string;
  participantRole!: TravelPackageParticipantRoleValue;
}
