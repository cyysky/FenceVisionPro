import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RenderService } from './render.service';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SegmentDto {
  @IsNumber() x1: number; @IsNumber() y1: number;
  @IsNumber() x2: number; @IsNumber() y2: number;
  @IsNumber() lengthM: number;
}

class RenderDto {
  @IsString() floorPlanUrl: string;
  @IsString() designOverlayUrl: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SegmentDto)
  fenceSegments: SegmentDto[];
  @IsNumber() floorPlanWidthM: number;
  @IsNumber() floorPlanHeightM: number;
  @IsOptional() @IsString() quoteId?: string;
}

@UseGuards(AuthGuard('jwt'))
@Controller('render')
export class RenderController {
  constructor(private svc: RenderService) {}

  @Post()
  async render(@Body() dto: RenderDto) {
    const url = await this.svc.compositeTopDown(dto);
    return { url };
  }
}
