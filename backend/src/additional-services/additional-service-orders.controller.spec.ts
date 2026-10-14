import { BadRequestException } from "@nestjs/common";
import { AdditionalServiceOrdersController } from "./additional-service-orders.controller";
import { AdditionalServicesService } from "./additional-services.service";
import { CommercialProposalEmailService } from "./commercial-proposal-email.service";
import { CommercialProposalPdfService } from "./commercial-proposal-pdf.service";
import { CommercialProposalStatus } from "./enums";
import type { AdditionalServiceOrderRecord } from "./repositories";
import { SalesOrderConversionService } from "../sales-orders/sales-order-conversion.service";
import { CommercialProposalInPersonApprovalService } from "./commercial-proposal-in-person-approval.service";
import { AdditionalServiceCommercialCostEvidenceService } from "./additional-service-commercial-cost-evidence.service";

describe("AdditionalServiceOrdersController commercial proposals", () => {
  it("accepts multipart creation evidence mapped by the transient line key", async () => {
    const { controller, createOrder } = setup({
      id: "order-1",
      tenantId: "tenant-1",
      commercialStatus: CommercialProposalStatus.DRAFT,
    } as AdditionalServiceOrderRecord);

    await expect(
      controller.create(
        request,
        {
          payload: JSON.stringify({
            idempotencyKey: "workflow-1",
            travelId: "travel-1",
            travelType: "INTERNATIONAL",
            quoteCustomerId: "client-1",
            quotationCurrency: "USD",
            lines: [
              {
                temporaryLineKey: "pricing-line-a",
                serviceCode: "TOUR",
                serviceDetailsVersion: 1,
                serviceDetails: { serviceDate: "2026-10-20", tourName: "City Tour" },
                supplierId: "supplier-1",
                supplierCost: 100,
                supplierCostCurrency: "USD",
                participantIds: ["client-1"],
              },
            ],
          }),
        },
        [
          {
            fieldname: "costEvidence.pricing-line-a",
            buffer: Buffer.from("image"),
            mimetype: "image/png",
            originalname: "quote.png",
            size: 5,
          },
        ],
      ),
    ).resolves.toEqual({ orderId: "order-1", status: CommercialProposalStatus.DRAFT });

    expect(createOrder).toHaveBeenCalledWith(
      "tenant-1",
      { id: "user-1", fullName: "Agent One" },
      expect.objectContaining({ lines: [expect.objectContaining({ temporaryLineKey: "pricing-line-a" })] }),
      [expect.objectContaining({ temporaryLineKey: "pricing-line-a" })],
    );
  });

  it("loads the tenant-owned order and delegates generation to persist", async () => {
    const order = {
      id: "order-1",
      tenantId: "tenant-1",
      commercialStatus: CommercialProposalStatus.DRAFT,
    } as AdditionalServiceOrderRecord;
    const { controller, getOrder, persist } = setup(order);

    await expect(
      controller.generateCommercialProposal(request, "order-1"),
    ).resolves.toEqual({ documentId: "document-1" });
    expect(getOrder).toHaveBeenCalledWith("tenant-1", "order-1");
    expect(persist).toHaveBeenCalledWith(order, "tenant-1");
  });

  it("rejects generation when persisted status is not DRAFT", async () => {
    const { controller, persist } = setup({
      id: "order-1",
      tenantId: "tenant-1",
      commercialStatus: CommercialProposalStatus.SENT,
    } as AdditionalServiceOrderRecord);

    await expect(
      controller.generateCommercialProposal(request, "order-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(persist).not.toHaveBeenCalled();
  });

  it("passes only the optional CC to the existing delivery service", async () => {
    const order = {
      id: "order-1",
      tenantId: "tenant-1",
      commercialStatus: CommercialProposalStatus.PDF_GENERATED,
    } as AdditionalServiceOrderRecord;
    const { controller, getOrder, send } = setup(order);
    send.mockResolvedValue({ commercialStatus: CommercialProposalStatus.SENT });

    await controller.sendCommercialProposal(request, "order-1", {
      cc: "copy@example.com",
    });

    expect(getOrder).toHaveBeenCalledWith("tenant-1", "order-1");
    expect(send).toHaveBeenCalledWith(
      order,
      "tenant-1",
      {
        userId: "user-1",
        email: "agent@example.test",
        fullName: "Agent One",
      },
      "copy@example.com",
    );
  });

  it("takes the in-person approver identity from authenticated context", async () => {
    const order = {
      id: "order-1",
      tenantId: "tenant-1",
      commercialStatus: CommercialProposalStatus.SENT,
    } as AdditionalServiceOrderRecord;
    const { controller, approveInPerson } = setup(order);

    await controller.approveCommercialProposalInPerson(request, "order-1");

    expect(approveInPerson).toHaveBeenCalledWith(order, "tenant-1", {
      id: "user-1",
      fullName: "Agent One",
    });
  });
});

const request = {
  user: {
    id: "user-1",
    fullName: "Agent One",
    email: "agent@example.test",
    tenantId: "tenant-1",
  },
};

function setup(order: AdditionalServiceOrderRecord) {
  const getOrder = jest.fn().mockResolvedValue(order);
  const createOrder = jest.fn().mockResolvedValue({
    id: "order-1",
    status: CommercialProposalStatus.DRAFT,
  });
  const persist = jest.fn().mockResolvedValue({
    id: "document-1",
    tenantId: "tenant-1",
    objectKey: "private/path.pdf",
  });
  const send = jest.fn();
  const approveInPerson = jest.fn();
  const controller = new AdditionalServiceOrdersController(
    { getOrder, createOrder } as unknown as AdditionalServicesService,
    { persist } as unknown as CommercialProposalPdfService,
    { send } as unknown as CommercialProposalEmailService,
    {} as SalesOrderConversionService,
    { approve: approveInPerson } as unknown as CommercialProposalInPersonApprovalService,
    {} as AdditionalServiceCommercialCostEvidenceService,
  );
  return { controller, getOrder, createOrder, persist, send, approveInPerson };
}
