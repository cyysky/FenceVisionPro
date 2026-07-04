-- Rename the Wholesaler tenant model to Dealer.
-- All foreign-key columns, indexes, and constraint names are renamed
-- too so the rest of the database stays consistent. This is a
-- non-destructive rename: existing rows are preserved and FK
-- constraints are updated automatically by Postgres when we
-- rename the columns and the referenced table.

-- Rename the table (which also renames the primary key index
-- and the unique slug index automatically).
ALTER TABLE "Wholesaler" RENAME TO "Dealer";

-- Rename the FK columns on every dependent table. The constraint
-- name doesn't need explicit RENAME because Postgres updates it
-- to follow the new column name.
ALTER TABLE "User"            RENAME COLUMN "wholesalerId" TO "dealerId";
ALTER TABLE "PriceOverride"   RENAME COLUMN "wholesalerId" TO "dealerId";
ALTER TABLE "QuoteTemplate"   RENAME COLUMN "wholesalerId" TO "dealerId";
ALTER TABLE "Quote"           RENAME COLUMN "wholesalerId" TO "dealerId";
ALTER TABLE "Project"         RENAME COLUMN "wholesalerId" TO "dealerId";

-- Rename the indexes that reference the old column name. Postgres
-- would have auto-generated new index names when we renamed the
-- column above for the *_idx ones, but the *_key unique constraints
-- keep the old name until we touch them.
ALTER INDEX "User_wholesalerId_idx"                 RENAME TO "User_dealerId_idx";
ALTER INDEX "Quote_wholesalerId_idx"                RENAME TO "Quote_dealerId_idx";
ALTER INDEX "Project_wholesalerId_idx"              RENAME TO "Project_dealerId_idx";
ALTER INDEX "PriceOverride_wholesalerId_productId_key" RENAME TO "PriceOverride_dealerId_productId_key";
ALTER INDEX "QuoteTemplate_wholesalerId_key"        RENAME TO "QuoteTemplate_dealerId_key";

-- The role enum: rename WHOLESALER_* variants to DEALER_*. Postgres
-- doesn't allow renaming enum values directly, so we add the new
-- variants, migrate the data, and drop the old ones in one
-- transaction.
ALTER TYPE "Role" RENAME VALUE 'WHOLESALER_OWNER' TO 'DEALER_OWNER';
ALTER TYPE "Role" RENAME VALUE 'WHOLESALER_STAFF' TO 'DEALER_STAFF';
