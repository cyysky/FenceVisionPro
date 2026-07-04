import { Module } from '@nestjs/common';
import { InstallationsController } from './installations.controller';
import { PublicInstallationsController } from './public-installations.controller';
import { InstallationsService } from './installations.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Installation module.
 *
 * Owns the dealer-facing InstallationsController AND the
 * public installer / customer controllers. Both controllers
 * share a single InstallationsService so the audit trail
 * (InstallationEvent) and lifecycle rules stay in one place.
 */
@Module({
  imports: [PrismaModule],
  controllers: [InstallationsController, PublicInstallationsController],
  providers: [InstallationsService],
  exports: [InstallationsService],
})
export class InstallationsModule {}
