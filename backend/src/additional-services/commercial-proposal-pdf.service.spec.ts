import { CommercialProposalPdfMapper } from "./commercial-proposal-pdf.mapper";
import { CommercialProposalPdfService } from "./commercial-proposal-pdf.service";
import type { CommercialProposalPdfDto } from "./dto";
import type { AdditionalServiceOrderRecord } from "./repositories";
import { TenantService } from "../tenant/tenant.service";

describe("CommercialProposalPdfService", () => {
  it("resolves the public company projection from Company Settings", async () => {
    const order = { orderNumber: "AS-2026-0042" } as AdditionalServiceOrderRecord;
    const document = { proposalNumber: order.orderNumber } as CommercialProposalPdfDto;
    const mapper = {
      map: jest.fn().mockReturnValue(document),
    } as unknown as CommercialProposalPdfMapper;
    const tenantService = {
      getTenantConfig: jest.fn().mockResolvedValue({
        id: "tenant-internal-id",
        name: "Viajes Ejemplo",
        legalId: "3-101-123456",
        contactEmail: "ventas@example.com",
        contactPhone: "+506 2222-2222",
        logoUrl: "https://example.com/logo.png",
        businessAddress: "San José",
        primaryColor: "#123456",
      }),
    } as unknown as TenantService;
    const service = new CommercialProposalPdfService(mapper, tenantService);

    await expect(service.prepareDocument(order, "tenant-auth-id")).resolves.toBe(
      document,
    );
    expect(tenantService.getTenantConfig).toHaveBeenCalledWith("tenant-auth-id");
    expect(mapper.map).toHaveBeenCalledWith(order, {
      name: "Viajes Ejemplo",
      legalId: "3-101-123456",
      contactEmail: "ventas@example.com",
      contactPhone: "+506 2222-2222",
      logoSrc: "https://example.com/logo.png",
    });
  });
});
