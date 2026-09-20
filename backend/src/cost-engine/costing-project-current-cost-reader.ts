import { Injectable, NotFoundException } from "@nestjs/common";

export type CostingProjectCurrentCostTransaction = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export type CostingProjectCurrentCost = {
  costingProjectId: string;
  baseCurrency: string;
  authoritativeTotalCost: string;
};

type CurrentCostRow = {
  costingProjectId: string;
  baseCurrency: string;
  authoritativeTotalCost: string;
};

/**
 * Cost Engine's bounded read port for consumers that need only a project's
 * current monetary authority, without exposing CostComponent internals.
 */
@Injectable()
export class CostingProjectCurrentCostReader {
  async read(
    tx: CostingProjectCurrentCostTransaction,
    tenantId: string,
    costingProjectId: string,
  ): Promise<CostingProjectCurrentCost> {
    const rows = await tx.$queryRaw<CurrentCostRow[]>`
      SELECT project."id" AS "costingProjectId",
             project."baseCurrency" AS "baseCurrency",
             COALESCE(SUM(snapshot."amount"), 0)::text AS "authoritativeTotalCost"
      FROM "costing_projects" project
      LEFT JOIN "cost_components" component
        ON component."tenantId" = project."tenantId"
       AND component."costingProjectId" = project."id"
       AND component."status" = 'ACTIVE'::"CostComponentStatus"
      LEFT JOIN "cost_snapshots" snapshot
        ON snapshot."id" = component."currentSnapshotId"
       AND snapshot."tenantId" = component."tenantId"
       AND snapshot."costComponentId" = component."id"
       AND snapshot."costingProjectId" = component."costingProjectId"
      WHERE project."tenantId" = ${tenantId}
        AND project."id" = ${costingProjectId}
      GROUP BY project."id", project."baseCurrency"
    `;
    if (rows.length !== 1) throw new NotFoundException("Costing project not found.");
    return rows[0];
  }
}
