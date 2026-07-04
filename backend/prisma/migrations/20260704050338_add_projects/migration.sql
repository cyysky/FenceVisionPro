-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "InstallScope" AS ENUM ('FULL', 'HALF', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'QUOTED', 'APPROVED', 'INSTALLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectDocumentKind" AS ENUM ('SITE_PHOTO', 'FLOOR_PLAN', 'PROPERTY_DEED', 'REFERENCE_IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectVisualizationKind" AS ENUM ('AI_IMAGE', 'AI_3D_SNAPSHOT', 'TOPDOWN_COMPOSITE');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "wholesalerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "projectType" "ProjectType" NOT NULL DEFAULT 'RESIDENTIAL',
    "installScope" "InstallScope" NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "totalLinearMeters" DOUBLE PRECISION,
    "totalAreaSqM" DOUBLE PRECISION,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProjectDocumentKind" NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caption" TEXT,

    CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFenceSelection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "designId" TEXT,
    "linearMeters" DOUBLE PRECISION NOT NULL,
    "heightFt" DOUBLE PRECISION NOT NULL,
    "panelCount" INTEGER,
    "gateCount" INTEGER,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectFenceSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMeasurement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lengthM" DOUBLE PRECISION NOT NULL,
    "heightFt" DOUBLE PRECISION NOT NULL,
    "widthM" DOUBLE PRECISION,
    "slopeDeg" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "ProjectMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectVisualization" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProjectVisualizationKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "prompt" TEXT,
    "modelUsed" TEXT,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVisualization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_wholesalerId_idx" ON "Project"("wholesalerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_installScope_idx" ON "Project"("installScope");

-- CreateIndex
CREATE INDEX "Project_projectType_idx" ON "Project"("projectType");

-- CreateIndex
CREATE INDEX "ProjectDocument_projectId_kind_idx" ON "ProjectDocument"("projectId", "kind");

-- CreateIndex
CREATE INDEX "ProjectFenceSelection_projectId_idx" ON "ProjectFenceSelection"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMeasurement_projectId_idx" ON "ProjectMeasurement"("projectId");

-- CreateIndex
CREATE INDEX "ProjectVisualization_projectId_kind_idx" ON "ProjectVisualization"("projectId", "kind");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "Wholesaler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFenceSelection" ADD CONSTRAINT "ProjectFenceSelection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFenceSelection" ADD CONSTRAINT "ProjectFenceSelection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFenceSelection" ADD CONSTRAINT "ProjectFenceSelection_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeasurement" ADD CONSTRAINT "ProjectMeasurement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVisualization" ADD CONSTRAINT "ProjectVisualization_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
