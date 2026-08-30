import { ForbiddenException, RequestMethod, ValidationPipe } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { BillingDocumentService } from "./billing-document.service";
import { FiscalBillingController } from "./fiscal-billing.controller";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { CreateBillingDraftDto, ManualInvoiceEmailResendDto } from "./dto/fiscal-billing.dto";

describe("FiscalBillingController authorization", () => {
  it("declares only ADMIN and FACTURACION_COBROS roles", () => {
    expect(Reflect.getMetadata(ROLES_KEY, FiscalBillingController)).toEqual([
      UserRole.ADMIN,
      UserRole.FACTURACION_COBROS,
    ]);
  });

  it.each([UserRole.ADMIN, UserRole.FACTURACION_COBROS])(
    "authorizes %s",
    (role) => {
      expect(canActivate(role)).toBe(true);
    },
  );

  it.each([UserRole.AGENT, UserRole.OPERACIONES, UserRole.CONTADOR])(
    "rejects %s",
    (role) => {
      expect(() => canActivate(role)).toThrow(ForbiddenException);
    },
  );
});

describe("FiscalBillingController draft request validation", () => {
  it("rejects caller-owned exchangeRate through the global pipe contract", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        {
          fiscalIssuerId: "issuer-a",
          documentTypeCode: "04",
          paymentMethodCodes: ["01"],
          exchangeRate: "454.34",
        },
        { type: "body", metatype: CreateBillingDraftDto },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.arrayContaining([
          expect.stringContaining("exchangeRate should not exist"),
        ]),
      }),
    });
  });
});

describe("FiscalBillingController workspace",()=>{
  it("keeps the existing guarded route and delegates once with authenticated tenant identity",async()=>{const workspace={id:"document-a",allocatedSequenceNumber:"9999999999"},getWorkspace=jest.fn().mockResolvedValue(workspace),controller=new FiscalBillingController({} as never,{getWorkspace} as unknown as BillingDocumentService,{} as never,{} as never,{} as never),handler=FiscalBillingController.prototype.workspace;expect(Reflect.getMetadata(PATH_METADATA,handler)).toBe("documents/:billingDocumentId/workspace");expect(Reflect.getMetadata(METHOD_METADATA,handler)).toBe(RequestMethod.GET);await expect(controller.workspace({user:{id:"user-a",tenantId:"tenant-a",role:UserRole.ADMIN}},"document-a")).resolves.toBe(workspace);expect(getWorkspace).toHaveBeenCalledTimes(1);expect(getWorkspace).toHaveBeenCalledWith("tenant-a","document-a");});
});

describe("FiscalBillingController accepted invoice", () => {
  it("exposes the guarded GET route and uses only the authenticated tenant", async () => {
    const invoice = { billingDocumentId: "document-a" };
    const getAcceptedInvoice = jest.fn().mockResolvedValue(invoice);
    const controller = new FiscalBillingController(
      {} as never,
      { getAcceptedInvoice } as unknown as BillingDocumentService,
      {} as never,
      {} as never,
      {} as never,
    );
    const handler = FiscalBillingController.prototype.invoice;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      "invoices/:billingDocumentId",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    await expect(
      controller.invoice(
        {
          user: {
            id: "user-a",
            tenantId: "tenant-a",
            role: UserRole.FACTURACION_COBROS,
          },
        },
        "document-a",
      ),
    ).resolves.toBe(invoice);
    expect(getAcceptedInvoice).toHaveBeenCalledTimes(1);
    expect(getAcceptedInvoice).toHaveBeenCalledWith("tenant-a", "document-a");
  });
});

describe('FiscalBillingController artifact reads', () => {
  it('keeps artifact routes behind the existing guards and trusted tenant context', async () => {
    const artifacts = [{ artifactType: 'SIGNED_FISCAL_XML', version: 1, status: 'AVAILABLE', downloadAvailable: true }];
    const read = { list: jest.fn().mockResolvedValue(artifacts), download: jest.fn().mockResolvedValue({ bytes: Buffer.from('<xml/>'), mimeType: 'application/xml', filename: 'signed-fiscal-document-v1.xml' }) };
    const controller = new FiscalBillingController({} as never, {} as never, read as never, {} as never, {} as never);
    const request = { user: { id: 'user-a', tenantId: 'tenant-a', role: UserRole.FACTURACION_COBROS } };
    expect(Reflect.getMetadata(PATH_METADATA, FiscalBillingController.prototype.listArtifacts)).toBe('documents/:billingDocumentId/artifacts');
    expect(Reflect.getMetadata(PATH_METADATA, FiscalBillingController.prototype.downloadArtifact)).toBe('documents/:billingDocumentId/artifacts/:artifactType/versions/:version/download');
    await expect(controller.listArtifacts(request, 'document-a')).resolves.toBe(artifacts);
    expect(read.list).toHaveBeenCalledWith('tenant-a', 'document-a');
    const response = { set: jest.fn(), send: jest.fn() };
    await controller.downloadArtifact(request, 'document-a', 'SIGNED_FISCAL_XML', '1', response as never);
    expect(read.download).toHaveBeenCalledWith('tenant-a', 'document-a', 'SIGNED_FISCAL_XML', '1');
    expect(response.set).toHaveBeenCalledWith({ 'Content-Type': 'application/xml', 'Content-Length': '6', 'Content-Disposition': 'attachment; filename="signed-fiscal-document-v1.xml"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    expect(response.send).toHaveBeenCalledWith(Buffer.from('<xml/>'));
  });
});

describe("FiscalBillingController invoice PDF", () => {
  it("exposes the guarded POST route and delegates with the authenticated tenant", async () => {
    const result = { artifactType: "INTERNAL_PDF", version: 1, status: "AVAILABLE" };
    const generateAndPersist = jest.fn().mockResolvedValue(result);
    const controller = new FiscalBillingController(
      {} as never,
      {} as never,
      {} as never,
      { generateAndPersist } as never,
      {} as never,
    );
    const handler = FiscalBillingController.prototype.generateInvoicePdf;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("invoices/:billingDocumentId/pdf");
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    await expect(controller.generateInvoicePdf(
      { user: { id: "user-a", tenantId: "tenant-a", role: UserRole.FACTURACION_COBROS } },
      "document-a",
    )).resolves.toBe(result);
    expect(generateAndPersist).toHaveBeenCalledWith("tenant-a", "document-a");
  });
});

describe("FiscalBillingController manual invoice email resend", () => {
  it("exposes the guarded POST route and delegates only trusted tenant/user identity plus DTO recipients", async () => {
    const queued = { queued: true, requestId: "request-a" };
    const requestManualResend = jest.fn().mockResolvedValue(queued);
    const controller = new FiscalBillingController({} as never, {} as never, {} as never, {} as never, { requestManualResend } as never);
    const handler = FiscalBillingController.prototype.resendInvoiceEmail;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("invoices/:billingDocumentId/email");
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    await expect(controller.resendInvoiceEmail({ user: { id: "user-a", tenantId: "tenant-a", role: UserRole.FACTURACION_COBROS } }, "document-a", { to: "to@example.com", cc: ["cc@example.com"] })).resolves.toBe(queued);
    expect(requestManualResend).toHaveBeenCalledWith({ tenantId: "tenant-a", billingDocumentId: "document-a", requestedByUserId: "user-a", to: "to@example.com", cc: ["cc@example.com"] });
  });

  it("rejects invalid primary and CC addresses through the existing validation pipe", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    await expect(pipe.transform({ to: "invalid", cc: ["valid@example.com", "bad"] }, { type: "body", metatype: ManualInvoiceEmailResendDto })).rejects.toBeDefined();
  });
});

describe("FiscalBillingController electronic issuance request", () => {
  const newlyAllocated = allocationResult(true);
  const existingAllocation = allocationResult(false);

  it("exposes the exact POST route behind the controller JWT and role guards", () => {
    const handler =
      FiscalBillingController.prototype.requestElectronicIssuance;

    expect(Reflect.getMetadata(PATH_METADATA, FiscalBillingController)).toBe(
      "fiscal-billing",
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      "documents/:billingDocumentId/request-electronic-issuance",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, FiscalBillingController)).toEqual(
      [JwtAuthGuard, RolesGuard],
    );
  });

  it.each([
    ["new allocation", newlyAllocated],
    ["idempotent allocation", existingAllocation],
  ])("delegates once and passes through the %s response unchanged", async (_, allocation) => {
    const billingDocumentService = {
      requestElectronicIssuance: jest.fn().mockResolvedValue(allocation),
    };
    const controller = createController(billingDocumentService);

    await expect(
      controller.requestElectronicIssuance(
        {
          user: {
            id: "authenticated-user",
            tenantId: "authenticated-tenant",
            role: UserRole.ADMIN,
          },
        },
        "path-document",
      ),
    ).resolves.toBe(allocation);
    expect(billingDocumentService.requestElectronicIssuance).toHaveBeenCalledTimes(1);
    expect(billingDocumentService.requestElectronicIssuance).toHaveBeenCalledWith(
      "authenticated-tenant",
      "path-document",
      "authenticated-user",
    );
  });

  it("accepts no request body", () => {
    expect(
      FiscalBillingController.prototype.requestElectronicIssuance.length,
    ).toBe(2);
  });

  it.each([
    "BILLING_DOCUMENT_NOT_FOUND",
    "BILLING_DOCUMENT_FISCAL_READINESS_FAILED",
    "BILLING_DOCUMENT_SEQUENCE_NOT_CONFIGURED",
    "BILLING_DOCUMENT_SEQUENCE_EXHAUSTED",
    "BILLING_DOCUMENT_ALLOCATION_STATE_CONFLICT",
    "BILLING_DOCUMENT_CONCURRENT_ALLOCATION_CONFLICT",
    "BILLING_DOCUMENT_OUTBOX_CONFLICT",
  ] as const)("preserves the safe %s error", async (code) => {
    const error = fiscalBillingError(code);
    const billingDocumentService = {
      requestElectronicIssuance: jest.fn().mockRejectedValue(error),
    };
    const controller = createController(billingDocumentService);

    await expect(
      controller.requestElectronicIssuance(
        {
          user: {
            id: "user-a",
            tenantId: "tenant-a",
            role: UserRole.FACTURACION_COBROS,
          },
        },
        "document-a",
      ),
    ).rejects.toBe(error);
  });
});

function canActivate(role: UserRole) {
  const guard = new RolesGuard(new Reflector());
  const context = {
    getHandler: () => FiscalBillingController.prototype.listEligible,
    getClass: () => FiscalBillingController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  };
  return guard.canActivate(context as never);
}

function createController(billingDocumentService: {
  requestElectronicIssuance: jest.Mock;
}) {
  return new FiscalBillingController(
    {} as never,
    billingDocumentService as unknown as BillingDocumentService,
    {} as never,
    {} as never,
    {} as never,
  );
}

function allocationResult(newlyAllocated: boolean) {
  return {
    billingDocumentId: "document-a",
    sequenceId: "sequence-a",
    allocatedSequenceNumber: "225",
    providerBase: "0000000225",
    fiscalNumber: "00100001010000000225",
    issuanceIdempotencyKey:
      "billing-document:document-a:electronic-issuance:v1",
    outboxEventId: "outbox-a",
    outboxDeduplicationKey:
      "billing-document:document-a:electronic-issuance-requested:v1",
    lifecycleStatus: "CONFIRMED",
    providerStatus: "PENDING",
    newlyAllocated,
  };
}
