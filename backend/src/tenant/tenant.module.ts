import { Module, Global } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantMiddleware } from './tenant.middleware';
import { TenantGuard } from './tenant.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [TenantController],
  providers: [TenantService, TenantMiddleware, TenantGuard],
  exports: [TenantService, TenantGuard],
})
export class TenantModule {}
