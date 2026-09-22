import { BadRequestException, Injectable } from "@nestjs/common";
import {
  SalesOrderFiscalSnapshotMaterializationService,
  type FrozenFiscalSalesOrderLineInput,
  type SourceNeutralSalesOrderMaterializationInput,
  type SourceNeutralSalesOrderMaterializationResult,
  type SalesOrderMaterializationTransaction,
} from "./sales-order-fiscal-snapshot-materialization.service";

/**
 * Trusted, internal input supplied only after the calling commercial source
 * has established its own tenant ownership and approval boundary.
 */
export interface ApprovedCommercialSourceIdentity {
  sourceType: string;
  sourceId: string;
  /** Loaded from the approved source by its adapter, never from a client. */
  tenantId: string;
}

export interface SourceNeutralSalesOrderMaterializationContext {
  /** Authenticated or source-resolved tenant identity; never client input. */
  tenantId: string;
}

export type SourceNeutralSalesOrderLineInput =
  FrozenFiscalSalesOrderLineInput;

export type SourceNeutralSalesOrderCommand = Omit<
  SourceNeutralSalesOrderMaterializationInput,
  "sourceType" | "sourceId"
> & {
  source: ApprovedCommercialSourceIdentity;
};

/**
 * The internal port used by approved commercial-source adapters. Fiscal-line
 * validation and immutable persistence remain owned by the fiscal snapshot
 * materializer; this service only establishes the source-neutral boundary.
 */
@Injectable()
export class SalesOrderSourceMaterializationService {
  constructor(
    private readonly fiscalSnapshotMaterializer: SalesOrderFiscalSnapshotMaterializationService,
  ) {}

  async materialize(
    context: SourceNeutralSalesOrderMaterializationContext,
    command: SourceNeutralSalesOrderCommand,
  ): Promise<SourceNeutralSalesOrderMaterializationResult> {
    const { source, ...order } = command;
    if (source.tenantId !== context.tenantId) {
      throw new BadRequestException("SALES_ORDER_SOURCE_TENANT_INVALID");
    }
    return this.fiscalSnapshotMaterializer.materialize(context.tenantId, {
      ...order,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    });
  }

  async materializeInTransaction(
    transaction: SalesOrderMaterializationTransaction,
    context: SourceNeutralSalesOrderMaterializationContext,
    command: SourceNeutralSalesOrderCommand,
  ): Promise<SourceNeutralSalesOrderMaterializationResult> {
    const { source, ...order } = command;
    if (source.tenantId !== context.tenantId) {
      throw new BadRequestException("SALES_ORDER_SOURCE_TENANT_INVALID");
    }
    return this.fiscalSnapshotMaterializer.materializeInTransaction(transaction, context.tenantId, {
      ...order,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    });
  }
}
