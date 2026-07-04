import { Module } from '@nestjs/common';
import { InstallersController } from './installers.controller';
import { InstallersService } from './installers.service';

/**
 * Installer directory module.
 *
 * Exposes CRUD over the Installer model, scoped to the caller's
 * tenant. The service is self-contained — no other module
 * currently consumes it — so we don't export it.
 */
@Module({
  controllers: [InstallersController],
  providers: [InstallersService],
})
export class InstallersModule {}
