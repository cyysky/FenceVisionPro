import {
  ArrayMaxSize, IsArray, IsEmail, IsIn, IsNumber, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Trim a string and reject it if it becomes empty. We do this on
 * any user-provided text so that "   " is not accepted as a valid
 * name (which would pass naive @MinLength(1) checks).
 */
const TrimmedNonEmpty = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class FenceSegmentDto {
  @IsNumber() @Min(0) x1: number;
  @IsNumber() @Min(0) y1: number;
  @IsNumber() @Min(0) x2: number;
  @IsNumber() @Min(0) y2: number;
  // Length must be positive - the PlanEditor computes length from x1/y1/x2/y2
  // but it can still be 0 or negative if the user double-clicks the same point.
  @IsNumber() @Min(0.01) @Max(10000) lengthM: number;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() heightOption?: string;
  @IsOptional() @IsString() colorOption?: string;
}

export class CreateQuoteDto {
  @Transform(TrimmedNonEmpty) @IsString() @MinLength(1) @MaxLength(200) customerName: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() customerEmail: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(50) customerPhone?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(500) projectAddress?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(5000) notes?: string;

  @IsOptional() @IsString() selectedDesignId?: string;
  @IsOptional() @IsString() floorPlanUrl?: string;
  @IsOptional() @IsNumber() @Min(0) floorPlanWidthM?: number;
  @IsOptional() @IsNumber() @Min(0) floorPlanHeightM?: number;
  @IsOptional() @IsString() renderUrl?: string;

  @IsOptional() @IsString() validUntil?: string;

  // Sales tax in the US ranges 0-15% practically. 25% is a generous upper bound.
  @IsOptional() @IsNumber() @Min(0) @Max(25) taxRate?: number;

  // Cap the number of segments so a malicious client can't
  // ship a 100k-segment payload and DoS the line-item
  // computation. A realistic fence plan has <200 segments.
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FenceSegmentDto)
  fenceSegments: FenceSegmentDto[];
}

export class UpdateStatusDto {
  @IsIn(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'])
  status: 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
}

/**
 * Partial update for a DRAFT quote. The DRAFT is the only state where
 * edits are allowed; once SENT the customer may have already opened
 * the approval link, so we lock the line items. Only fields that the
 * wholesaler should be able to revise post-creation are exposed.
 */
export class UpdateQuoteDto {
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MinLength(1) @MaxLength(200) customerName?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() customerEmail?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(50) customerPhone?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(500) projectAddress?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(5000) notes?: string;

  @IsOptional() @IsString() selectedDesignId?: string;
  @IsOptional() @IsString() floorPlanUrl?: string;
  @IsOptional() @IsNumber() @Min(0) floorPlanWidthM?: number;
  @IsOptional() @IsNumber() @Min(0) floorPlanHeightM?: number;
  @IsOptional() @IsString() renderUrl?: string;

  @IsOptional() @IsString() validUntil?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(25) taxRate?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FenceSegmentDto)
  fenceSegments?: FenceSegmentDto[];
}
