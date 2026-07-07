-- CreateEnum
CREATE TYPE "PublicLeadYardSide" AS ENUM ('FRONT', 'BACK');

-- CreateEnum
CREATE TYPE "PublicLeadPhotoSource" AS ENUM ('UPLOADED', 'GALLERY');

-- CreateEnum
CREATE TYPE "PublicLeadStatus" AS ENUM ('PENDING', 'READY', 'CONTACTED', 'CONVERTED', 'ARCHIVED', 'FAILED');

-- CreateTable
CREATE TABLE "PublicLead" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "firstName" TEXT,
    "yardSide" "PublicLeadYardSide" NOT NULL,
    "photoSource" "PublicLeadPhotoSource" NOT NULL,
    "inputPhotoPath" TEXT NOT NULL,
    "inputGalleryId" TEXT,
    "designStyle" TEXT,
    "renderStatus" "PublicLeadStatus" NOT NULL DEFAULT 'PENDING',
    "renderUrl" TEXT,
    "renderPrompt" TEXT,
    "renderModelUsed" TEXT,
    "renderError" TEXT,
    "generatedAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "contactedById" TEXT,
    "notes" TEXT,
    "convertedQuoteId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicLead_renderStatus_idx" ON "PublicLead"("renderStatus");

-- CreateIndex
CREATE INDEX "PublicLead_createdAt_idx" ON "PublicLead"("createdAt");

-- CreateIndex
CREATE INDEX "PublicLead_contactedById_idx" ON "PublicLead"("contactedById");

-- AddForeignKey
ALTER TABLE "PublicLead" ADD CONSTRAINT "PublicLead_contactedById_fkey" FOREIGN KEY ("contactedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicLead" ADD CONSTRAINT "PublicLead_convertedQuoteId_fkey" FOREIGN KEY ("convertedQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

