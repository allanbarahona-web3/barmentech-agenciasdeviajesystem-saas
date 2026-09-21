import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PricingCalculationError, PRICING_V1, validatePricingV1Configuration } from "./pricing-v1-calculator";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type {
  CreateTenantPricingPolicyDto,
  UpdateTenantPricingPolicyDto,
} from "./dto/tenant-pricing-policy.dto";

export type TenantPricingPolicyActor = { userId: string; name: string };

type DecimalValue = { toFixed: (digits?: number) => string };
type TenantPricingPolicyRecord = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isDefaultForCustomQuotations: boolean;
  active: boolean;
  calculationPolicyVersion: string;
  operationalCostsAmountDefault: DecimalValue;
  riskMarginPercent: DecimalValue;
  targetProfitMarginPercent: DecimalValue;
  salesCommissionPercent: DecimalValue;
  bankCommissionPercent: DecimalValue;
  applicableTaxPercent: DecimalValue;
  createdByUserId: string;
  createdByName: string;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PolicyTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  tenantPricingPolicy: Record<string, (...args: any[]) => Promise<any>>;
};

type PolicyDatabase = {
  $transaction<T>(work: (transaction: PolicyTransaction) => Promise<T>): Promise<T>;
};

type PolicyInputs = {
  operationalCostsAmountDefault: string;
  riskMarginPercent: string;
  targetProfitMarginPercent: string;
  salesCommissionPercent: string;
  bankCommissionPercent: string;
  applicableTaxPercent: string;
};

@Injectable()
export class TenantPricingPolicyService {
  private readonly database: PolicyDatabase;

  constructor(prisma: PrismaService) {
    // Prisma generation is deliberately manual in this repository.
    this.database = prisma as unknown as PolicyDatabase;
  }

  list(tenantId: string, active?: boolean, page = 1, pageSize = 20) {
    const safePage = positiveInteger(page, 1);
    const safePageSize = Math.min(25, positiveInteger(pageSize, 20));
    return this.withTenantTransaction(tenantId, async (tx) => {
      const where = { tenantId, ...(active === undefined ? {} : { active }) };
      const [rows, total] = await Promise.all([
        tx.tenantPricingPolicy.findMany({
          where,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: (safePage - 1) * safePageSize,
          take: safePageSize,
        }) as Promise<TenantPricingPolicyRecord[]>,
        tx.tenantPricingPolicy.count({ where }) as Promise<number>,
      ]);
      return {
        items: rows.map(toResponse),
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.ceil(total / safePageSize),
      };
    });
  }

  async find(tenantId: string, policyId: string) {
    const policy = await this.findRecord(tenantId, policyId);
    if (!policy) throw new NotFoundException("TENANT_PRICING_POLICY_NOT_FOUND");
    return toResponse(policy);
  }

  async create(
    tenantId: string,
    input: CreateTenantPricingPolicyDto,
    actor: TenantPricingPolicyActor,
  ) {
    const policyInputs = validatePolicyInputs(defaultInputs(input));
    const active = input.active ?? true;
    const isDefaultForCustomQuotations =
      input.isDefaultForCustomQuotations ?? false;
    assertActiveDefaultCoherence(active, isDefaultForCustomQuotations);
    try {
      return await this.withTenantTransaction(tenantId, async (tx) => {
        if (isDefaultForCustomQuotations) {
          await clearActiveDefault(tx, tenantId, undefined, actor);
        }
        const policy = (await tx.tenantPricingPolicy.create({
          data: {
            tenantId,
            name: requiredText(input.name, "TENANT_PRICING_POLICY_NAME_INVALID"),
            description: optionalText(input.description),
            active,
            isDefaultForCustomQuotations,
            calculationPolicyVersion: PRICING_V1,
            ...policyInputs,
            createdByUserId: actor.userId,
            createdByName: actor.name,
          },
        })) as TenantPricingPolicyRecord;
        return toResponse(policy);
      });
    } catch (error) {
      throwKnownConflict(error);
    }
  }

  async update(
    tenantId: string,
    policyId: string,
    input: UpdateTenantPricingPolicyDto,
    actor: TenantPricingPolicyActor,
  ) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException("TENANT_PRICING_POLICY_UPDATE_EMPTY");
    }
    try {
      return await this.withTenantTransaction(tenantId, async (tx) => {
        const current = await requirePolicy(tx, tenantId, policyId);
        const active = input.active ?? current.active;
        const requestedDefault =
          input.isDefaultForCustomQuotations ??
          (active ? current.isDefaultForCustomQuotations : false);
        assertActiveDefaultCoherence(active, requestedDefault);
        const policyInputs = validatePolicyInputs(mergeInputs(current, input));
        if (requestedDefault) {
          await clearActiveDefault(tx, tenantId, policyId, actor);
        }
        const updated = await tx.tenantPricingPolicy.updateMany({
          where: { id: policyId, tenantId },
          data: {
            ...(input.name === undefined
              ? {}
              : { name: requiredText(input.name, "TENANT_PRICING_POLICY_NAME_INVALID") }),
            ...(input.description === undefined
              ? {}
              : { description: optionalText(input.description) }),
            active,
            isDefaultForCustomQuotations: requestedDefault,
            ...policyInputs,
            updatedByUserId: actor.userId,
            updatedByName: actor.name,
          },
        });
        if (updated.count !== 1) throw new ConflictException("TENANT_PRICING_POLICY_UPDATE_CONFLICT");
        const policy = await tx.tenantPricingPolicy.findFirst({
          where: { id: policyId, tenantId },
        }) as TenantPricingPolicyRecord | null;
        if (!policy) throw new NotFoundException("TENANT_PRICING_POLICY_NOT_FOUND");
        return toResponse(policy);
      });
    } catch (error) {
      throwKnownConflict(error);
    }
  }

  setStatus(
    tenantId: string,
    policyId: string,
    active: boolean,
    actor: TenantPricingPolicyActor,
  ) {
    return this.update(tenantId, policyId, { active }, actor);
  }

  setDefaultForCustomQuotations(
    tenantId: string,
    policyId: string,
    isDefaultForCustomQuotations: boolean,
    actor: TenantPricingPolicyActor,
  ) {
    return this.update(
      tenantId,
      policyId,
      { isDefaultForCustomQuotations },
      actor,
    );
  }

  /** Internal read contract for future trusted quotation adapters. */
  resolveDefaultCustomQuotationPricingPolicy(tenantId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const policy = await tx.tenantPricingPolicy.findFirst({
        where: {
          tenantId,
          active: true,
          isDefaultForCustomQuotations: true,
        },
      }) as TenantPricingPolicyRecord | null;
      return policy ? toResponse(policy) : null;
    });
  }

  private findRecord(tenantId: string, policyId: string) {
    return this.withTenantTransaction(tenantId, (tx) =>
      tx.tenantPricingPolicy.findFirst({
        where: { id: policyId, tenantId },
      }) as Promise<TenantPricingPolicyRecord | null>,
    );
  }

  private withTenantTransaction<T>(
    tenantId: string,
    work: (tx: PolicyTransaction) => Promise<T>,
  ) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

async function requirePolicy(
  tx: PolicyTransaction,
  tenantId: string,
  policyId: string,
): Promise<TenantPricingPolicyRecord> {
  const policy = await tx.tenantPricingPolicy.findFirst({
    where: { id: policyId, tenantId },
  }) as TenantPricingPolicyRecord | null;
  if (!policy) throw new NotFoundException("TENANT_PRICING_POLICY_NOT_FOUND");
  return policy;
}

function clearActiveDefault(
  tx: PolicyTransaction,
  tenantId: string,
  exceptPolicyId: string | undefined,
  actor: TenantPricingPolicyActor,
) {
  return tx.tenantPricingPolicy.updateMany({
    where: {
      tenantId,
      active: true,
      isDefaultForCustomQuotations: true,
      ...(exceptPolicyId ? { id: { not: exceptPolicyId } } : {}),
    },
    data: {
      isDefaultForCustomQuotations: false,
      updatedByUserId: actor.userId,
      updatedByName: actor.name,
    },
  });
}

function defaultInputs(input: Partial<PolicyInputs>): PolicyInputs {
  return {
    operationalCostsAmountDefault: input.operationalCostsAmountDefault ?? "0",
    riskMarginPercent: input.riskMarginPercent ?? "0",
    targetProfitMarginPercent: input.targetProfitMarginPercent ?? "0",
    salesCommissionPercent: input.salesCommissionPercent ?? "0",
    bankCommissionPercent: input.bankCommissionPercent ?? "0",
    applicableTaxPercent: input.applicableTaxPercent ?? "0",
  };
}

function mergeInputs(
  current: TenantPricingPolicyRecord,
  input: Partial<PolicyInputs>,
): PolicyInputs {
  return {
    operationalCostsAmountDefault:
      input.operationalCostsAmountDefault ??
      current.operationalCostsAmountDefault.toFixed(5),
    riskMarginPercent:
      input.riskMarginPercent ?? current.riskMarginPercent.toFixed(6),
    targetProfitMarginPercent:
      input.targetProfitMarginPercent ??
      current.targetProfitMarginPercent.toFixed(6),
    salesCommissionPercent:
      input.salesCommissionPercent ??
      current.salesCommissionPercent.toFixed(6),
    bankCommissionPercent:
      input.bankCommissionPercent ?? current.bankCommissionPercent.toFixed(6),
    applicableTaxPercent:
      input.applicableTaxPercent ?? current.applicableTaxPercent.toFixed(6),
  };
}

function validatePolicyInputs(inputs: PolicyInputs): PolicyInputs {
  try {
    validatePricingV1Configuration({
      operationalCostsAmount: inputs.operationalCostsAmountDefault,
      riskMarginPercent: inputs.riskMarginPercent,
      targetProfitMarginPercent: inputs.targetProfitMarginPercent,
      salesCommissionPercent: inputs.salesCommissionPercent,
      bankCommissionPercent: inputs.bankCommissionPercent,
      applicableTaxPercent: inputs.applicableTaxPercent,
    });
    return inputs;
  } catch (error) {
    if (error instanceof PricingCalculationError) {
      throw new BadRequestException(error.code);
    }
    throw error;
  }
}

function assertActiveDefaultCoherence(
  active: boolean,
  isDefaultForCustomQuotations: boolean,
) {
  if (isDefaultForCustomQuotations && !active) {
    throw new BadRequestException("TENANT_PRICING_POLICY_DEFAULT_INACTIVE");
  }
}

function requiredText(value: unknown, errorCode: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw new BadRequestException(errorCode);
  return normalized;
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new BadRequestException("TENANT_PRICING_POLICY_TEXT_INVALID");
  const normalized = value.trim();
  return normalized || null;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    ((error as { code?: unknown }).code === "P2002" ||
      (error as { code?: unknown }).code === "23505");
}

function throwKnownConflict(error: unknown): never {
  if (isUniqueConstraint(error)) {
    throw new ConflictException("TENANT_PRICING_POLICY_CONFLICT");
  }
  throw error;
}

function toResponse(policy: TenantPricingPolicyRecord) {
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    active: policy.active,
    isDefaultForCustomQuotations: policy.isDefaultForCustomQuotations,
    calculationPolicyVersion: policy.calculationPolicyVersion,
    operationalCostsAmountDefault: policy.operationalCostsAmountDefault.toFixed(5),
    riskMarginPercent: policy.riskMarginPercent.toFixed(6),
    targetProfitMarginPercent: policy.targetProfitMarginPercent.toFixed(6),
    salesCommissionPercent: policy.salesCommissionPercent.toFixed(6),
    bankCommissionPercent: policy.bankCommissionPercent.toFixed(6),
    applicableTaxPercent: policy.applicableTaxPercent.toFixed(6),
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
    createdBy: { userId: policy.createdByUserId, name: policy.createdByName },
    updatedBy: policy.updatedByUserId
      ? { userId: policy.updatedByUserId, name: policy.updatedByName }
      : null,
  };
}
