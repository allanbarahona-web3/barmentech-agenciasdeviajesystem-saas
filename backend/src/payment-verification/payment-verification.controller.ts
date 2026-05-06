import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentVerificationService } from './payment-verification.service';

@Controller('payment-verification')
@UseGuards(JwtAuthGuard)
export class PaymentVerificationController {
  constructor(
    private readonly paymentVerificationService: PaymentVerificationService,
  ) {}

  @Post('process-receipt')
  @UseInterceptors(FileInterceptor('receipt'))
  async processReceipt(
    @Req() req: { user: { id: string; fullName: string; tenantId: string } },
    @UploadedFile() file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    return this.paymentVerificationService.processReceipt(
      file,
      req.user.id,
      req.user.fullName,
      req.user.tenantId,
    );
  }

  @Get('receipts/:id')
  getReceipt(@Param('id') id: string) {
    return this.paymentVerificationService.getReceipt(id);
  }

  @Get('receipts')
  listReceipts(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentVerificationService.listReceipts({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
