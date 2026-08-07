import { Controller, Get, Headers, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { CommercialProposalApprovalService } from "./commercial-proposal-approval.service";

@Controller("public/commercial-proposals")
export class CommercialProposalPublicController {
  constructor(
    private readonly approvalService: CommercialProposalApprovalService,
  ) {}

  @Get(":token")
  getProposal(@Param("token") token: string) {
    return this.approvalService.getPublicProposal(token);
  }

  @Post(":token/approve")
  approve(
    @Param("token") token: string,
    @Req() req: Request,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.approvalService.approve(
      token,
      req.ip || null,
      userAgent || null,
    );
  }
}
