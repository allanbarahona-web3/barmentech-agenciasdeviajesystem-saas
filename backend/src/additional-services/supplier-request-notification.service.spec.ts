import { JobDispatcherService } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import {
  NEW_SUPPLIER_REQUEST_JOB_NAME,
  SupplierRequestNotificationService,
} from "./supplier-request-notification.service";

describe("SupplierRequestNotificationService", () => {
  it("dispatches an administration notification with the request context", async () => {
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue({ id: "notification-1" }),
    } as unknown as jest.Mocked<JobDispatcherService>;
    const service = new SupplierRequestNotificationService(jobDispatcher);

    await service.notifyAdministration({
      tenantId: "tenant-1",
      requestedBy: {
        id: "user-1",
        name: "Agent One",
      },
      supplierName: "Supplier One",
      website: "https://supplier.example",
      notes: "Needed for this service.",
      travelType: "INTERNATIONAL",
      additionalService: "Asistencia para Visas",
      orderId: null,
    });

    expect(jobDispatcher.dispatch).toHaveBeenCalledWith({
      queueKey: PLATFORM_QUEUE_KEYS.NOTIFICATION,
      jobName: NEW_SUPPLIER_REQUEST_JOB_NAME,
      payload: {
        recipientRoles: ["ADMIN"],
        title: "New Supplier Request",
        tenantId: "tenant-1",
        requestedBy: {
          id: "user-1",
          name: "Agent One",
        },
        supplierName: "Supplier One",
        website: "https://supplier.example",
        notes: "Needed for this service.",
        travelType: "INTERNATIONAL",
        additionalService: "Asistencia para Visas",
        orderId: null,
      },
      metadata: {
        tenantId: "tenant-1",
      },
    });
  });
});
