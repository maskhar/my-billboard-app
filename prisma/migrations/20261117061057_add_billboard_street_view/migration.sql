-- AlterTable
ALTER TABLE "Billboard" ADD COLUMN     "streetViewFov" DOUBLE PRECISION,
ADD COLUMN     "streetViewHeading" DOUBLE PRECISION,
ADD COLUMN     "streetViewPanoId" TEXT,
ADD COLUMN     "streetViewPitch" DOUBLE PRECISION;
