-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "aiImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aiOverviewImageUrl" TEXT;
