import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Validated shape of a public AI-generation submission. The
 * controller also accepts multipart with a `file` field; this DTO
 * covers all the body fields (multipart text fields + JSON body).
 *
 * At least one of `email` or `phone` is required - enforced by the
 * service after the class-validator pass because class-validator's
 * `@ValidateIf` is more awkward to read than a one-liner.
 */
export class SubmitLeadDto {
  @IsString()
  @IsIn(['UPLOADED', 'GALLERY'])
  photoSource!: 'UPLOADED' | 'GALLERY';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  galleryId?: string;

  @IsString()
  @IsIn(['FRONT', 'BACK'])
  yardSide!: 'FRONT' | 'BACK';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  designStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  // Permissive phone format: digits, spaces, dashes, parens,
  // optional leading '+'. We accept whatever the customer types
  // and don't try to normalise it here; the sales rep sees it
  // as-typed.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[+0-9 ()\-]+$/, { message: 'phone contains invalid characters' })
  phone?: string;

  // Internal-use flags forwarded by the frontend if needed. Kept
  // optional so the curl smoke test stays one line.
  @IsOptional()
  @IsBoolean()
  agreeTerms?: boolean;
}
