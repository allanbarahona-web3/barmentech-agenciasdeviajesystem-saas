import { IsNotEmpty, IsString } from 'class-validator';

export class LinkUserDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}