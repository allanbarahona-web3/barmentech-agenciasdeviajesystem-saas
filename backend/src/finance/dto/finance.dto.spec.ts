import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  ListAccountReceivableGroupsDto,
  ListContractObligationGroupsDto,
} from "./finance.dto";

describe("grouped Finance customer search DTOs", () => {
  it.each([ListAccountReceivableGroupsDto, ListContractObligationGroupsDto])(
    "trims a bounded customer search and treats whitespace as absent",
    async (Dto) => {
      const populated = plainToInstance(Dto, { customerSearch: "  Allan Barahona  " });
      const blank = plainToInstance(Dto, { customerSearch: "   " });

      expect(populated.customerSearch).toBe("Allan Barahona");
      await expect(validate(populated)).resolves.toHaveLength(0);
      expect(blank.customerSearch).toBeUndefined();
      await expect(validate(blank)).resolves.toHaveLength(0);
      await expect(validate(plainToInstance(Dto, { customerSearch: "x".repeat(192) }))).resolves.not.toHaveLength(0);
    },
  );
});
