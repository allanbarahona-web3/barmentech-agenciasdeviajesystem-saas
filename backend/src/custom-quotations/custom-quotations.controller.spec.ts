import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CustomQuotationsController } from "./custom-quotations.controller";

describe("CustomQuotationsController", () => {
  it("permits ADMIN and AGENT only, and derives tenant and actor from authentication", async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CustomQuotationsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, CustomQuotationsController)).toEqual([UserRole.ADMIN, UserRole.AGENT]);
    const service = { create: jest.fn().mockResolvedValue({ id: "quotation-a" }) };
    const costing = { resolveOrCreateCostingProject: jest.fn().mockResolvedValue({ costingProjectId: "project-a" }) };
    const pricing = { calculate: jest.fn().mockResolvedValue({ pricingCalculationVersionId: "version-a" }), getLatestCommercialState: jest.fn().mockResolvedValue({ hasCalculation: false }) };
    const versions = {
      issue: jest.fn().mockResolvedValue({ customQuotationVersionId: "issued-a" }),
      find: jest.fn().mockResolvedValue({ versionId: "version-a" }),
      findLatest: jest.fn().mockResolvedValue({ versionId: "version-a" }),
    };
    const proposals = { persist: jest.fn().mockResolvedValue({ id: "document-a" }), getPersistedPreview: jest.fn().mockResolvedValue({ id: "document-a" }) };
    const approvals = { accept: jest.fn().mockResolvedValue({ status: "ACCEPTED" }), reject: jest.fn().mockResolvedValue({ status: "REJECTED" }) };
    const delivery = { send: jest.fn().mockResolvedValue({ documentId: "document-a" }) };
    const salesOrders = { materialize: jest.fn().mockResolvedValue({ salesOrderId: "sales-a" }) };
    const leadConversion = { convert: jest.fn().mockResolvedValue({ customerId: "customer-a", salesOrderReady: true }) };
    const controller = new CustomQuotationsController(service as never, costing as never, pricing as never, versions as never, proposals as never, approvals as never, delivery as never, salesOrders as never, leadConversion as never);
    const request = { user: { id: "agent-a", fullName: "Agent A", email: "agent@example.com", tenantId: "tenant-a" } };
    const body = { customerId: "customer-a" } as never;
    await controller.create(request, body);
    expect(service.create).toHaveBeenCalledWith("tenant-a", body, { userId: "agent-a", name: "Agent A" });
    await controller.resolveCostingProject(request, "quotation-a");
    expect(costing.resolveOrCreateCostingProject).toHaveBeenCalledWith("tenant-a", "quotation-a", { userId: "agent-a", name: "Agent A" });
    await controller.calculatePricing(request, "quotation-a");
    expect(pricing.calculate).toHaveBeenCalledWith("tenant-a", "quotation-a", { userId: "agent-a", name: "Agent A" });
    await controller.getLatestPricing(request, "quotation-a");
    expect(pricing.getLatestCommercialState).toHaveBeenCalledWith("tenant-a", "quotation-a");
    await controller.issue(request, "quotation-a");
    expect(versions.issue).toHaveBeenCalledWith("tenant-a", "quotation-a", { userId: "agent-a", name: "Agent A" });
    await controller.getLatestVersion(request, "quotation-a");
    expect(versions.findLatest).toHaveBeenCalledWith("tenant-a", "quotation-a");
    await controller.getVersion(request, "quotation-a", "version-a");
    expect(versions.find).toHaveBeenCalledWith("tenant-a", "quotation-a", "version-a");
    await controller.generateProposal(request, "quotation-a", "version-a");
    expect(proposals.persist).toHaveBeenCalledWith("tenant-a", "quotation-a", "version-a");
    await controller.getProposal(request, "quotation-a", "version-a");
    expect(proposals.getPersistedPreview).toHaveBeenCalledWith("tenant-a", "quotation-a", "version-a");
    await controller.accept(request, "quotation-a", "version-a");
    expect(approvals.accept).toHaveBeenCalledWith("tenant-a", "quotation-a", "version-a", { userId: "agent-a", name: "Agent A" });
    await controller.reject(request, "quotation-a", "version-a");
    expect(approvals.reject).toHaveBeenCalledWith("tenant-a", "quotation-a", "version-a", { userId: "agent-a", name: "Agent A" });
    await controller.sendProposal(request, "quotation-a", "version-a");
    expect(delivery.send).toHaveBeenCalledWith("tenant-a", "quotation-a", "version-a", { userId: "agent-a", email: "agent@example.com", name: "Agent A" });
    await controller.materializeSalesOrder(request, "quotation-a", "version-a");
    expect(salesOrders.materialize).toHaveBeenCalledWith("tenant-a", "quotation-a", "version-a", { userId: "agent-a", name: "Agent A" });
    const customer = { fullName: "Ana Cliente", idType: "CEDULA_FISICA", idNumber: "1-2345-6789", email: "ana@example.test" } as never;
    await controller.convertLeadToCustomer(request, "quotation-a", customer);
    expect(leadConversion.convert).toHaveBeenCalledWith("tenant-a", "quotation-a", customer, { userId: "agent-a", name: "Agent A" });
    expect(controller.calculatePricing.length).toBe(2);
  });
});
