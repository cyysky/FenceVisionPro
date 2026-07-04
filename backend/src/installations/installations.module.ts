import { Module } from '@nestjs/common';
import { InstallationsController } from './installations.controller';
import { InstallationsService } from './installations.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Installation module - wraps the protected wholesaler endpoints
 * (InstallationsController) and the shared InstallationsService.
 * The public installer / customer controllers are wired in here
 * too once they exist in step 3, so the whole installation
 * surface shares a single Nest module.
 */
@Module({
  imports: [PrismaModule],
  controllers: [InstallationsController],
  providers: [InstallationsService],
  exports: [InstallationsService],
})
export class InstallationsModule {}
