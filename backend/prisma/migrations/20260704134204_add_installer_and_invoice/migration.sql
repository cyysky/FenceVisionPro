-- CreateEnum
CREATE TYPE "InstallerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "Dealer" RENAME CONSTRAINT "Wholesaler_pkey" TO "Dealer_pkey";

-- AlterTable
ALTER TABLE "Installation" ADD COLUMN     "installerId" TEXT;

-- CreateTable
CREATE TABLE "Installer" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "companyName" TEXT,
    "status" "InstallerStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Installer_dealerId_idx" ON "Installer"("dealerId");

-- CreateIndex
CREATE INDEX "Installer_dealerId_status_idx" ON "Installer"("dealerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_dealerId_idx" ON "Invoice"("dealerId");

-- CreateIndex
CREATE INDEX "Invoice_quoteId_idx" ON "Invoice"("quoteId");

-- CreateIndex
CREATE INDEX "Invoice_dealerId_status_idx" ON "Invoice"("dealerId", "status");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "Installation_installerId_idx" ON "Installation"("installerId");

-- RenameForeignKey
ALTER TABLE "PriceOverride" RENAME CONSTRAINT "PriceOverride_wholesalerId_fkey" TO "PriceOverride_dealerId_fkey";

-- RenameForeignKey
ALTER TABLE "Project" RENAME CONSTRAINT "Project_wholesalerId_fkey" TO "Project_dealerId_fkey";

-- RenameForeignKey
ALTER TABLE "Quote" RENAME CONSTRAINT "Quote_wholesalerId_fkey" TO "Quote_dealerId_fkey";

-- RenameForeignKey
ALTER TABLE "QuoteTemplate" RENAME CONSTRAINT "QuoteTemplate_wholesalerId_fkey" TO "QuoteTemplate_dealerId_fkey";

-- RenameForeignKey
ALTER TABLE "User" RENAME CONSTRAINT "User_wholesalerId_fkey" TO "User_dealerId_fkey";

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_installerId_fkey" FOREIGN KEY ("installerId") REFERENCES "Installer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installer" ADD CONSTRAINT "Installer_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Wholesaler_slug_key" RENAME TO "Dealer_slug_key";
