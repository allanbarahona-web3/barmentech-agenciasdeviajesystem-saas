import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RLSInterceptor } from '../common/interceptors/rls.interceptor';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(RLSInterceptor) // Multi-tenant RLS
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Req()
    req: {
      user: { id: string; fullName: string; tenantId: string };
    },
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(
      req.user.tenantId,
      dto,
      req.user.id,
      req.user.fullName,
    );
  }

  @Get()
  @Roles('ADMIN', 'CONTADOR')
  findAll(
    @Req() req: { user: { tenantId: string } },
    @Query('status') status?: string,
    @Query('position') position?: string,
    @Query('department') department?: string,
    @Query('search') search?: string,
  ) {
    return this.employeesService.findAll(req.user.tenantId, {
      status: status as any,
      position,
      department,
      search,
    });
  }

  @Get('stats')
  @Roles('ADMIN', 'CONTADOR')
  getStats(@Req() req: { user: { tenantId: string } }) {
    return this.employeesService.getStats(req.user.tenantId);
  }

  @Get(':id')
  @Roles('ADMIN', 'CONTADOR')
  findOne(@Req() req: { user: { tenantId: string } }, @Param('id') id: string) {
    return this.employeesService.findOne(req.user.tenantId, id);
  }

  @Put(':id')
  @Roles('ADMIN')
  update(
    @Req() req: { user: { tenantId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(req.user.tenantId, id, dto);
  }

  @Post(':id/documents')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Req()
    req: {
      user: { id: string; fullName: string; tenantId: string };
    },
    @Param('id') id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile()
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    return this.employeesService.uploadDocument(
      req.user.tenantId,
      id,
      dto,
      file,
      req.user.id,
      req.user.fullName,
    );
  }

  @Delete('documents/:documentId')
  @Roles('ADMIN')
  deleteDocument(
    @Req() req: { user: { tenantId: string } },
    @Param('documentId') documentId: string,
  ) {
    return this.employeesService.deleteDocument(req.user.tenantId, documentId);
  }

  @Get('documents/:documentId/url')
  @Roles('ADMIN', 'CONTADOR')
  getDocumentUrl(
    @Req() req: { user: { tenantId: string } },
    @Param('documentId') documentId: string,
  ) {
    return this.employeesService.getDocumentUrl(req.user.tenantId, documentId);
  }
}
