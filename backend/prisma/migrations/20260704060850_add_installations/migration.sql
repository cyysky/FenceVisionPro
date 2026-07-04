-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('SCHEDULED', 'MATERIALS_ORDERED', 'IN_PROGRESS', 'COMPLETED', 'INSPECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallationEventType" AS ENUM ('SCHEDULED', 'KICKOFF', 'MATERIALS_ORDERED', 'MATERIALS_RECEIVED', 'POSTS_SET', 'PANELS_HUNG', 'GATE_INSTALLED', 'PHOTO_UPLOADED', 'NOTE_ADDED', 'IN_PROGRESS', 'COMPLETED', 'INSPECTED', 'CUSTOMER_APPROVED', 'CANCELLED', 'PUBLIC_LINK_ISSUIED');

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "status" "InstallationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "installerName" TEXT,
    "installerPhone" TEXT,
    "installerEmail" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "inspectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationEvent" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "type" "InstallationEventType" NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorLabel" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "InstallationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationPhoto" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "caption" TEXT,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "data" BYTEA NOT NULL,
    "uploadedByKind" TEXT NOT NULL,
    "uploadedByLabel" TEXT,
    "takenAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicCustomerLink" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicCustomerLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Installation_quoteId_key" ON "Installation"("quoteId");

-- CreateIndex
CREATE INDEX "Installation_status_idx" ON "Installation"("status");

-- CreateIndex
CREATE INDEX "Installation_scheduledStart_idx" ON "Installation"("scheduledStart");

-- CreateIndex
CREATE INDEX "InstallationEvent_installationId_occurredAt_idx" ON "InstallationEvent"("installationId", "occurredAt");

-- CreateIndex
CREATE INDEX "InstallationPhoto_installationId_kind_idx" ON "InstallationPhoto"("installationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PublicCustomerLink_token_key" ON "PublicCustomerLink"("token");

-- CreateIndex
CREATE INDEX "PublicCustomerLink_installationId_idx" ON "PublicCustomerLink"("installationId");

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationEvent" ADD CONSTRAINT "InstallationEvent_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPhoto" ADD CONSTRAINT "InstallationPhoto_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicCustomerLink" ADD CONSTRAINT "PublicCustomerLink_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
