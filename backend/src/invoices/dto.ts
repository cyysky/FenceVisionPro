import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { Type, Transform } from 'class-transformer';

const TrimmedNonEmpty = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Invoice DTOs.
 *
 * Numbers (subtotal/tax/total/quantity/unitPrice) are typed as
 * numbers on the wire; Prisma persists them as DECIMAL(12,2).
 * class-transformer converts the JSON number to a Decimal on the
 * way in via `Type(() => Number)` and we coerce to Number on the
 * way to Prisma.
 */
export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PAID', 'VOID'] as const;
export type InvoiceStatusLiteral = typeof INVOICE_STATUSES[number];

/**
 * State machine. DRAFT → SENT, SENT → PAID | VOID, DRAFT → VOID.
 * Everything else is illegal and 400s.
 */
export const INVOICE_TRANSITIONS: Record<InvoiceStatusLiteral, InvoiceStatusLiteral[]> = {
  DRAFT: ['SENT', 'VOID'],
  SENT:  ['PAID', 'VOID'],
  PAID:  [],
  VOID:  [],
};

export class CreateInvoiceDto {
  @IsString() @MinLength(1) quoteId: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) notes?: string;
  /**
   * Tax percent applied on top of the quote's subtotal when
   * materialising the invoice. Default 0 (carry the quote's
   * tax rate forward, which is what most dealers want).
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxPercent?: number;
}

export class UpdateInvoiceDto {
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) notes?: string;
}

export class TransitionInvoiceDto {
  @IsIn([...INVOICE_STATUSES]) to: InvoiceStatusLiteral;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) note?: string;
}

export class ListInvoicesQueryDto {
  @IsOptional() @IsIn([...INVOICE_STATUSES]) status?: InvoiceStatusLiteral;
  @IsOptional() @IsString() quoteId?: string;
}
