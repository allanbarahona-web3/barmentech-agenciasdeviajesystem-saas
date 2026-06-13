import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class AdminCreateUserDto {
  @IsString()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @Matches(/^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/`~])/, {
    message: "La contraseña debe incluir al menos una letra mayúscula y un carácter especial (!@#$%&*...)"
  })
  password!: string;

  @IsOptional()
  @IsString()
  @IsIn(["AGENT", "ADMIN", "CONTADOR", "FACTURACION_COBROS", "VENTAS", "OPERACIONES", "agent", "admin", "contador", "facturacion_cobros", "ventas", "operaciones"])
  role?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

}
