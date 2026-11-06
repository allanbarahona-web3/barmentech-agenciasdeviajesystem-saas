import { registerDecorator, type ValidationOptions } from "class-validator";
import { isSupportedTenantTimeZone } from "../utils/tenant-timezone";

export const IsSupportedTenantTimeZone = (
  validationOptions?: ValidationOptions,
): PropertyDecorator =>
  (object, propertyName) => {
    registerDecorator({
      name: "isSupportedTenantTimeZone",
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      validator: {
        validate: isSupportedTenantTimeZone,
        defaultMessage: () =>
          "La zona horaria debe ser un identificador IANA válido y compatible.",
      },
    });
  };
