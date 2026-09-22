import { Controller, Get, Param, Post } from "@nestjs/common";
import { CustomQuotationCustomerApprovalService } from "./custom-quotation-customer-approval.service";

@Controller("public/custom-quotation-approval")
export class CustomQuotationCustomerApprovalPublicController {
  constructor(private readonly approvals: CustomQuotationCustomerApprovalService) {}

  @Get(":token")
  getProposal(@Param("token") token: string) {
    return this.approvals.getPublicProposal(token);
  }

  @Post(":token/accept")
  accept(@Param("token") token: string) {
    return this.approvals.accept(token);
  }

  @Post(":token/reject")
  reject(@Param("token") token: string) {
    return this.approvals.reject(token);
  }
}
