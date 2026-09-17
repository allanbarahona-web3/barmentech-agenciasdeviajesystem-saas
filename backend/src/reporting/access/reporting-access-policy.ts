import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { ReportExecutionContext, ReportKey } from "../contracts/reporting.contracts";

type AuthenticatedReportingIdentity = {
  tenantId: string;
  actorUserId: string;
  role: UserRole;
  timezone: string;
};

const READ_ACCESS: Readonly<Record<ReportKey, readonly UserRole[]>> = {
  SALES: [UserRole.ADMIN, UserRole.CONTADOR],
  SALES_TAX: [UserRole.ADMIN, UserRole.CONTADOR],
  RECEIVABLES: [UserRole.ADMIN, UserRole.CONTADOR],
};

/** ERP role policy. Reporting Core deliberately does not import this policy. */
@Injectable()
export class ReportingAccessPolicy {
  createReadContext(
    identity: AuthenticatedReportingIdentity,
    reportKey: ReportKey,
  ): ReportExecutionContext {
    if (!nonEmpty(identity.tenantId) || !nonEmpty(identity.actorUserId) || !nonEmpty(identity.timezone)) {
      throw new ForbiddenException("REPORTING_AUTHENTICATED_CONTEXT_REQUIRED");
    }
    if (!READ_ACCESS[reportKey].includes(identity.role)) {
      throw new ForbiddenException("REPORTING_ACCESS_DENIED");
    }
    return {
      tenantId: identity.tenantId,
      actorUserId: identity.actorUserId,
      reportKey,
      timezone: identity.timezone,
    };
  }
}

function nonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
