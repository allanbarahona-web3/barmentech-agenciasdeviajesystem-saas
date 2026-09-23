import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { isEmail } from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type { CreateLeadDto, ListLeadsDto, UpdateLeadDto } from "./dto/lead.dto";

export type LeadActor = { userId: string; name: string };

type LeadRecord = {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  status: "OPEN" | "CONVERTED";
  convertedCustomerId: string | null;
  convertedAt: Date | null;
  createdByUserId: string;
  createdByName: string;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LeadsTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  lead: Record<string, (...args: any[]) => Promise<any>>;
};

type LeadsDatabase = {
  $transaction<T>(work: (transaction: LeadsTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class LeadsService {
  private readonly database: LeadsDatabase;

  constructor(prisma: PrismaService) {
    // Prisma client generation is manual; this module follows the transaction
    // contract used by the repository's newer schema foundations.
    this.database = prisma as unknown as LeadsDatabase;
  }

  async create(tenantId: string, input: CreateLeadDto, actor: LeadActor) {
    const fullName = requiredText(input.fullName, "LEAD_FULL_NAME_INVALID");
    const email = requiredEmail(input.email);
    return this.withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.lead.create({
        data: {
          tenantId,
          fullName,
          email,
          phone: optionalText(input.phone),
          companyName: optionalText(input.companyName),
          status: "OPEN",
          createdByUserId: actor.userId,
          createdByName: actor.name,
        },
      }) as LeadRecord;
      return toResponse(row);
    });
  }

  list(tenantId: string, input: ListLeadsDto) {
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(25, positiveInteger(input.pageSize, 20));
    const search = optionalText(input.search);
    const where = {
      tenantId,
      ...(input.status ? { status: input.status } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { companyName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    return this.withTenantTransaction(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.lead.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }) as Promise<LeadRecord[]>,
        tx.lead.count({ where }) as Promise<number>,
      ]);
      return {
        items: rows.map(toResponse),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  async find(tenantId: string, leadId: string) {
    const row = await this.findRecord(tenantId, leadId);
    if (!row) throw new NotFoundException("LEAD_NOT_FOUND");
    return toResponse(row);
  }

  update(
    tenantId: string,
    leadId: string,
    input: UpdateLeadDto,
    actor: LeadActor,
  ) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException("LEAD_UPDATE_EMPTY");
    }
    return this.withTenantTransaction(tenantId, async (tx) => {
      const current = await tx.lead.findFirst({
        where: { id: leadId, tenantId },
      }) as LeadRecord | null;
      if (!current) throw new NotFoundException("LEAD_NOT_FOUND");
      if (current.status !== "OPEN") {
        throw new ConflictException("LEAD_CONVERTED_IMMUTABLE");
      }

      const updated = await tx.lead.updateMany({
        where: { id: leadId, tenantId, status: "OPEN" },
        data: {
          ...(input.fullName === undefined
            ? {}
            : { fullName: requiredText(input.fullName, "LEAD_FULL_NAME_INVALID") }),
          ...(input.email === undefined ? {} : { email: requiredEmail(input.email) }),
          ...(input.phone === undefined ? {} : { phone: optionalText(input.phone) }),
          ...(input.companyName === undefined
            ? {}
            : { companyName: optionalText(input.companyName) }),
          updatedByUserId: actor.userId,
          updatedByName: actor.name,
        },
      });
      if (updated.count !== 1) {
        const latest = await tx.lead.findFirst({ where: { id: leadId, tenantId } }) as LeadRecord | null;
        if (!latest) throw new NotFoundException("LEAD_NOT_FOUND");
        throw new ConflictException("LEAD_CONVERTED_IMMUTABLE");
      }
      const row = await tx.lead.findFirst({ where: { id: leadId, tenantId } }) as LeadRecord | null;
      if (!row) throw new NotFoundException("LEAD_NOT_FOUND");
      return toResponse(row);
    });
  }

  private findRecord(tenantId: string, leadId: string) {
    return this.withTenantTransaction(tenantId, (tx) =>
      tx.lead.findFirst({ where: { id: leadId, tenantId } }) as Promise<LeadRecord | null>,
    );
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: LeadsTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function requiredText(value: unknown, errorCode: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new BadRequestException(errorCode);
  return normalized;
}

function requiredEmail(value: unknown) {
  const normalized = requiredText(value, "LEAD_EMAIL_INVALID").toLowerCase();
  if (!isEmail(normalized)) throw new BadRequestException("LEAD_EMAIL_INVALID");
  return normalized;
}

function optionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function toResponse(row: LeadRecord) {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    companyName: row.companyName,
    status: row.status,
    convertedCustomerId: row.convertedCustomerId,
    convertedAt: row.convertedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: { userId: row.createdByUserId, name: row.createdByName },
    updatedBy: row.updatedByUserId
      ? { userId: row.updatedByUserId, name: row.updatedByName }
      : null,
  };
}
