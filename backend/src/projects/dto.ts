import {
  ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const TrimmedNonEmpty = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProjectDto {
  @Transform(TrimmedNonEmpty) @IsString() @MinLength(1) @MaxLength(200) customerName: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() customerEmail?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(50) customerPhone?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(500) customerAddress?: string;
  @IsOptional() @IsIn(['RESIDENTIAL', 'COMMERCIAL']) projectType?: 'RESIDENTIAL' | 'COMMERCIAL';
  @IsIn(['FULL', 'HALF', 'PARTIAL']) installScope: 'FULL' | 'HALF' | 'PARTIAL';
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsNumber() @Min(0) totalLinearMeters?: number;
  @IsOptional() @IsNumber() @Min(0) totalAreaSqM?: number;
  /**
   * Optional. Admins can create on behalf of a dealer; dealer
   * users must omit this (the controller overrides with the caller's
   * dealerId).
   */
  @IsOptional() @IsString() dealerId?: string;
}

export class UpdateProjectDto {
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MinLength(1) @MaxLength(200) customerName?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() customerEmail?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(50) customerPhone?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(500) customerAddress?: string;
  @IsOptional() @IsIn(['RESIDENTIAL', 'COMMERCIAL']) projectType?: 'RESIDENTIAL' | 'COMMERCIAL';
  @IsOptional() @IsIn(['FULL', 'HALF', 'PARTIAL']) installScope?: 'FULL' | 'HALF' | 'PARTIAL';
  @IsOptional() @IsIn(['DRAFT', 'SUBMITTED', 'QUOTED', 'APPROVED', 'INSTALLED', 'CANCELLED'])
  status?: 'DRAFT' | 'SUBMITTED' | 'QUOTED' | 'APPROVED' | 'INSTALLED' | 'CANCELLED';
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsNumber() @Min(0) totalLinearMeters?: number;
  @IsOptional() @IsNumber() @Min(0) totalAreaSqM?: number;
}

export class ListProjectsQueryDto {
  @IsOptional() @IsIn(['DRAFT', 'SUBMITTED', 'QUOTED', 'APPROVED', 'INSTALLED', 'CANCELLED'])
  status?: 'DRAFT' | 'SUBMITTED' | 'QUOTED' | 'APPROVED' | 'INSTALLED' | 'CANCELLED';
  @IsOptional() @IsIn(['RESIDENTIAL', 'COMMERCIAL']) projectType?: 'RESIDENTIAL' | 'COMMERCIAL';
  @IsOptional() @IsIn(['FULL', 'HALF', 'PARTIAL']) installScope?: 'FULL' | 'HALF' | 'PARTIAL';
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

export class CreateSelectionDto {
  @IsString() productId: string;
  @IsOptional() @IsString() designId?: string;
  @IsNumber() @Min(0.01) @Max(10000) linearMeters: number;
  @IsNumber() @Min(0.5) @Max(20) heightFt: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) panelCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) gateCount?: number;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class UpdateSelectionDto {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() designId?: string;
  @IsOptional() @IsNumber() @Min(0.01) @Max(10000) linearMeters?: number;
  @IsOptional() @IsNumber() @Min(0.5) @Max(20) heightFt?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) panelCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) gateCount?: number;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class CreateMeasurementDto {
  @Transform(TrimmedNonEmpty) @IsString() @MinLength(1) @MaxLength(120) label: string;
  @IsNumber() @Min(0.01) @Max(10000) lengthM: number;
  @IsNumber() @Min(0.5) @Max(20) heightFt: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) widthM?: number;
  @IsOptional() @IsNumber() @Min(-45) @Max(45) slopeDeg?: number;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateMeasurementDto {
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MinLength(1) @MaxLength(120) label?: string;
  @IsOptional() @IsNumber() @Min(0.01) @Max(10000) lengthM?: number;
  @IsOptional() @IsNumber() @Min(0.5) @Max(20) heightFt?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) widthM?: number;
  @IsOptional() @IsNumber() @Min(-45) @Max(45) slopeDeg?: number;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) notes?: string;
}

export class UploadDocumentDto {
  @IsIn(['SITE_PHOTO', 'FLOOR_PLAN', 'PROPERTY_DEED', 'REFERENCE_IMAGE', 'OTHER'])
  kind: 'SITE_PHOTO' | 'FLOOR_PLAN' | 'PROPERTY_DEED' | 'REFERENCE_IMAGE' | 'OTHER';
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(500) caption?: string;
}

export class GenerateVisualizationDto {
  @IsIn(['AI_IMAGE', 'AI_3D_SNAPSHOT']) kind: 'AI_IMAGE' | 'AI_3D_SNAPSHOT';
  @Transform(TrimmedNonEmpty) @IsString() @MinLength(1) @MaxLength(80) style: string;
  @Transform(TrimmedNonEmpty) @IsString() @MinLength(1) @MaxLength(40) color: string;
  @IsNumber() @Min(0.5) @Max(20) heightFt: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) panelCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) gateCount?: number;
}

export class PromoteToQuoteDto {
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MinLength(1) @MaxLength(200) customerName?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() customerEmail?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(50) customerPhone?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(500) customerAddress?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(5000) notes?: string;
}
