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
import { CreateBillingDraftDto } from "./dto/fiscal-billing.dto";

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
