import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AttendanceService } from './attendance.service';
import {
  AdminSummaryQueryDto,
  CheckInDto,
  ConfigAttendanceDto,
  CorrectionEntryDto,
  FilterEntriesDto,
  PeriodFilterDto,
} from './dto';

interface RequestWithUser {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
    tenantId: string | null;
  };
}

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  @Roles('AGENT', 'OPERACIONES', 'VENTAS')
  async checkIn(@Req() req: RequestWithUser, @Body() dto: CheckInDto) {
    return this.attendanceService.checkIn(req.user, dto);
  }

  @Post('check-out')
  @Roles('AGENT', 'OPERACIONES', 'VENTAS')
  async checkOut(@Req() req: RequestWithUser) {
    return this.attendanceService.checkIn(req.user, { state: 'OFF' });
  }

  @Get('status')
  @Roles('AGENT', 'OPERACIONES', 'VENTAS')
  async status(@Req() req: RequestWithUser) {
    return this.attendanceService.getStatus(req.user);
  }

  @Get('today')
  @Roles('AGENT', 'OPERACIONES', 'VENTAS')
  async today(@Req() req: RequestWithUser) {
    return this.attendanceService.getToday(req.user);
  }

  @Get('my-summary')
  @Roles('AGENT', 'OPERACIONES', 'VENTAS')
  async mySummary(@Req() req: RequestWithUser, @Query() query: PeriodFilterDto) {
    return this.attendanceService.getMySummary(req.user, query);
  }

  @Get('my-entries')
@Roles('AGENT', 'OPERACIONES', 'VENTAS')
async myEntries(
  @Req() req: RequestWithUser,
  @Query() query: PeriodFilterDto,
) {
  return this.attendanceService.getMyEntries(req.user, query);
}

  @Get('admin/entries')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async adminEntries(@Req() req: RequestWithUser, @Query() query: FilterEntriesDto) {
    return this.attendanceService.getAdminEntries(req.user, query);
  }

  @Get('admin/config')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async adminConfig(@Req() req: RequestWithUser, @Query('tenantId') tenantId?: string) {
    return this.attendanceService.getAdminConfig(req.user, tenantId);
  }

  @Patch('admin/config')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async updateAdminConfig(
    @Req() req: RequestWithUser,
    @Body() dto: ConfigAttendanceDto,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.attendanceService.updateAdminConfig(req.user, dto, tenantId);
  }

  @Get('admin/summaries')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async adminSummaries(@Req() req: RequestWithUser, @Query() query: AdminSummaryQueryDto) {
    return this.attendanceService.getAdminSummaries(req.user, query);
  }

  @Patch('admin/corrections/:entryId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async correctEntry(
    @Req() req: RequestWithUser,
    @Param('entryId') entryId: string,
    @Body() dto: CorrectionEntryDto,
  ) {
    return this.attendanceService.correctEntry(req.user, entryId, dto);
  }

  @Get(':entryId/corrections')
  @Roles('AGENT', 'OPERACIONES', 'VENTAS', 'ADMIN', 'SUPER_ADMIN')
  async getEntryCorrections(
    @Req() req: RequestWithUser,
    @Param('entryId') entryId: string,
  ) {
    return this.attendanceService.getEntryCorrections(req.user, entryId);
  }
}
