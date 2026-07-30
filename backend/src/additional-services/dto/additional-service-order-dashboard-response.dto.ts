import {
  AdditionalServiceCurrency,
  AdditionalServiceOrderStatus,
  AdditionalServiceTravelType,
} from "../enums";

export class AdditionalServiceOrderDashboardItemDto {
  id!: string;
  orderNumber!: string;
  customerName!: string | null;
  travelId!: string | null;
  travelName!: string | null;
  travelType!: AdditionalServiceTravelType;
  createdAt!: Date;
  totalAmount!: string;
  currency!: AdditionalServiceCurrency;
  status!: AdditionalServiceOrderStatus;
}

export class AdditionalServiceOrderDashboardResponseDto {
  orders!: AdditionalServiceOrderDashboardItemDto[];
  total!: number;
  page!: number;
  pageSize!: number;
  totalPages!: number;
}
