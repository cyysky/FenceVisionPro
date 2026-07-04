import {
  IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const TrimmedNonEmpty = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Status values are kept as string-literal unions rather than
 * referencing the Prisma enums directly. class-validator's @IsIn
 * works on plain string arrays, and the string forms match what
 * the public-facing DTOs (and the front-end) want to see.
 */
export const INSTALLATION_STATUSES = [
  'SCHEDULED', 'MATERIALS_ORDERED', 'IN_PROGRESS',
  'COMPLETED', 'INSPECTED', 'CANCELLED',
] as const;
export type InstallationStatusLiteral = typeof INSTALLATION_STATUSES[number];

export const INSTALLATION_TRANSITIONS: Record<InstallationStatusLiteral, InstallationStatusLiteral[]> = {
  SCHEDULED:        ['MATERIALS_ORDERED', 'IN_PROGRESS', 'CANCELLED'],
  MATERIALS_ORDERED:['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS:      ['COMPLETED', 'CANCELLED'],
  COMPLETED:        ['INSPECTED', 'CANCELLED'],
  INSPECTED:        [],
  CANCELLED:        [],
};

export const PHOTO_KINDS = ['BEFORE', 'DURING', 'AFTER', 'ISSUE'] as const;
export type PhotoKindLiteral = typeof PHOTO_KINDS[number];

export const LINK_PURPOSES = ['STATUS_UPDATE', 'COMPLETION_REVIEW', 'ALL'] as const;
export type LinkPurposeLiteral = typeof LINK_PURPOSES[number];

/**
 * Create an Installation for a given quote. The wholesaler must
 * already own the quote (ownership is checked in the service
 * layer against the caller's wholesalerId).
 */
export class CreateInstallationDto {
  @IsString() @MinLength(1) @MaxLength(80) quoteId: string;
  @IsOptional() @IsISO8601() scheduledStart?: string;
  @IsOptional() @IsISO8601() scheduledEnd?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(200) installerName?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(50) installerPhone?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsString() @MaxLength(200) installerEmail?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) note?: string;
}

/**
 * Partial update for an installation. We intentionally allow
 * patching the schedule and the installer contact details even
 * after the kickoff, since real-world jobs get rescheduled.
 * Status is updated via the dedicated transition endpoint so we
 * can audit it.
 */
export class UpdateInstallationDto {
  @IsOptional() @IsISO8601() scheduledStart?: string;
  @IsOptional() @IsISO8601() scheduledEnd?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(200) installerName?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(50) installerPhone?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsString() @MaxLength(200) installerEmail?: string;
}

/**
 * Status transition. We validate the target status against the
 * allowed-next-statuses map in the service. The optional note
 * is recorded on the audit event.
 */
export class TransitionInstallationDto {
  @IsIn([...INSTALLATION_STATUSES]) toStatus: InstallationStatusLiteral;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) note?: string;
}

/**
 * Filtering for the list endpoint. Mirrors the Quote list DTO
 * (wholesaler + status + search + paging) so the dashboard UI
 * feels consistent.
 */
export class ListInstallationsQueryDto {
  @IsOptional() @IsIn([...INSTALLATION_STATUSES]) status?: InstallationStatusLiteral;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @Type(() => Number) limit?: number;
}
import { Type } from 'class-transformer';

/**
 * Form fields that ride along with an installation photo upload.
 * The file itself arrives as multipart/form-data.
 */
export class UploadInstallationPhotoDto {
  @IsIn([...PHOTO_KINDS]) kind: PhotoKindLiteral;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(500) caption?: string;
  @IsOptional() @IsISO8601() takenAt?: string;
}

/**
 * Issue a new public customer link. The token is generated server
 * side (32 random bytes -> 64 hex chars). expiresAt is optional
 * and absolute; null/undefined means "no expiry".
 */
export class CreateCustomerLinkDto {
  @IsIn([...LINK_PURPOSES]) purpose: LinkPurposeLiteral;
  @IsOptional() @IsISO8601() expiresAt?: string;
}
