import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ROLES_KEY } from "../auth/roles.decorator";
import { AdditionalServiceFiscalProfilesController } from "./additional-service-fiscal-profiles.controller";

describe("AdditionalServiceFiscalProfilesController authorization", () => {
  it("requires ADMIN and authentication/role guards", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdditionalServiceFiscalProfilesController)).toEqual(["ADMIN"]);
    expect(Reflect.getMetadata(GUARDS_METADATA, AdditionalServiceFiscalProfilesController)).toHaveLength(2);
  });
});
