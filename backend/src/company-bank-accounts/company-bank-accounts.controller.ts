import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CompanyBankAccountsService } from './company-bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { ListBankAccountsDto } from './dto/list-bank-accounts.dto';

@Controller('company-bank-accounts')
@UseGuards(JwtAuthGuard)
export class CompanyBankAccountsController {
  constructor(
    private readonly companyBankAccountsService: CompanyBankAccountsService,
  ) {}

  @Post()
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  create(
    @Req() req: { user: { id: string; fullName: string; tenantId: string } },
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.companyBankAccountsService.create(
      dto,
      req.user.id,
      req.user.fullName,
      req.user.tenantId,
    );
  }

  @Get()
  findAll(
    @Query() filters: ListBankAccountsDto,
    @Req() req: { user: { tenantId: string } },
  ) {
    return this.companyBankAccountsService.findAll(filters, req.user.tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: { user: { tenantId: string } },
  ) {
    return this.companyBankAccountsService.findOne(id, req.user.tenantId);
  }

  @Put(':id')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
    @Req() req: { user: { tenantId: string } },
  ) {
    return this.companyBankAccountsService.update(id, dto, req.user.tenantId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  remove(
    @Param('id') id: string,
    @Req() req: { user: { tenantId: string } },
  ) {
    return this.companyBankAccountsService.remove(id, req.user.tenantId);
  }

  @Patch(':id/toggle-active')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  toggleActive(
    @Param('id') id: string,
    @Req() req: { user: { tenantId: string } },
  ) {
    return this.companyBankAccountsService.toggleActive(id, req.user.tenantId);
  }
}
