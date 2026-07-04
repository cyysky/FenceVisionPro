import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const TrimmedNonEmpty = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Installer DTOs.
 *
 * Phone and email are optional. The privacy rules in the spec
 * are clear: we never seed or default these fields, and we never
 * pull a phone number from any other model. Whatever the dealer
 * types here is the value stored.
 */
export class CreateInstallerDto {
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateInstallerDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}
