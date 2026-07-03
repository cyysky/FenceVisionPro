import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AiService } from './ai.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

class FenceParamsDto {
  @IsString() @IsNotEmpty() @MaxLength(50) style: string;
  @IsString() @IsNotEmpty() @MaxLength(50) color: string;
  // Residential fences are 1-12ft. We cap at 30 to be generous but
  // prevent absurd values that would burn AI tokens on junk prompts.
  @IsNumber() @Min(1) @Max(30) heightFt: number;
  @IsOptional() @IsString() @MaxLength(500) surroundings?: string;
  @IsOptional() @IsString() @MaxLength(500) extraPrompt?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) panelCount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) gateCount?: number;
}

@UseGuards(AuthGuard('jwt'))
@Controller('ai')
export class AiController {
  constructor(private ai: AiService, private prisma: PrismaService) {}

  @Get('status')
  status() {
    return { enabled: this.ai.enabled, imageModel: this.ai['imageModel'], codeModel: this.ai['codeModel'] };
  }

  /**
   * Render a photorealistic fence image based on design parameters.
   * Body example:
   *   { "style": "Privacy", "color": "Black", "heightFt": 6,
   *     "surroundings": "suburban lawn", "extraPrompt": "..." }
   */
  @Post('render-image')
  async renderImage(@Body() dto: FenceParamsDto) {
    if (!this.ai.enabled) throw new BadRequestException('AI is disabled');
    const { url, relPath } = await this.ai.generateFenceImage(dto);
    return { url, relPath };
  }

  /**
   * Generate a three.js scene as raw JS source. The frontend renders
   * it inside a sandboxed iframe so the LLM-generated code cannot
   * touch the host app.
   */
  @Post('generate-3d')
  async generate3d(@Body() dto: FenceParamsDto) {
    if (!this.ai.enabled) throw new BadRequestException('AI is disabled');
    return this.ai.generateThreeJsScene(dto);
  }
}
