import { Injectable } from "@nestjs/common";
import { JobDispatcherService } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";

export const NEW_SUPPLIER_REQUEST_JOB_NAME = "new-supplier-request";

export interface NewSupplierRequestNotification {
  tenantId: string;
  requestedBy: {
    id: string;
    name: string;
  };
  supplierName: string;
  website: string | null;
  notes: string | null;
  travelType: "INTERNATIONAL" | "INTERNAL";
  additionalService: string;
  orderId: string | null;
}

export interface NewSupplierRequestNotificationPayload
  extends NewSupplierRequestNotification {
  recipientRoles: ["ADMIN"];
  title: "New Supplier Request";
}

@Injectable()
export class SupplierRequestNotificationService {
  constructor(private readonly jobDispatcher: JobDispatcherService) {}

  async notifyAdministration(
    request: NewSupplierRequestNotification,
  ): Promise<void> {
    const payload: NewSupplierRequestNotificationPayload = {
      recipientRoles: ["ADMIN"],
      title: "New Supplier Request",
      ...request,
    };

    await this.jobDispatcher.dispatch({
      queueKey: PLATFORM_QUEUE_KEYS.NOTIFICATION,
      jobName: NEW_SUPPLIER_REQUEST_JOB_NAME,
      payload,
      metadata: {
        tenantId: request.tenantId,
      },
    });
  }
}
