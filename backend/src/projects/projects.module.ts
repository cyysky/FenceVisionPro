import { Module, forwardRef } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotesModule } from '../quotes/quotes.module';

/**
 * End Customer Project module.
 *
 * Owns the rich project entity (customer + property + documents +
 * measurements + AI visualisations) that an installer works up BEFORE
 * promoting to a Quote. QuotesModule is pulled in via forwardRef so we
 * can call QuotesService.create() from ProjectsService.promoteToQuote()
 * without forcing QuotesService to depend on ProjectsService.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => QuotesModule)],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
