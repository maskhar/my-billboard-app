/*
  Warnings:

  - You are about to alter the column `amount` on the `AdditionalCharge` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(15,2)`.
  - You are about to alter the column `price` on the `Billboard` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(15,2)`.
  - The `status` column on the `Billboard` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `publishStatus` column on the `Billboard` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `price` on the `BillboardHistory` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(15,2)`.
  - You are about to alter the column `totalPrice` on the `Booking` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(15,2)`.
  - You are about to alter the column `dpAmount` on the `Booking` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(15,2)`.
  - The `status` column on the `Booking` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `designStatus` column on the `Booking` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `refundAmount` on the `Booking` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(15,2)`.
  - The `status` column on the `ChatSession` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `authProvider` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `status` on the `BillboardHistory` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `designOption` on the `Booking` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `sender` on the `ChatMessage` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'CS');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "BillboardStatus" AS ENUM ('Available', 'Booked');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'PAID_CONFIRMED', 'DESIGN_RECEIVED', 'IN_PRODUCTION', 'INSTALLATION', 'ACTIVE', 'REVIEW_REFUND', 'WAITING_BANK', 'PROCESS_REFUND', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DesignStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DesignOption" AS ENUM ('upload', 'service');

-- CreateEnum
CREATE TYPE "ChatSessionStatus" AS ENUM ('OPEN', 'AGENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChatSender" AS ENUM ('USER', 'ADMIN', 'BOT', 'SYSTEM');

-- AlterTable
ALTER TABLE "AdditionalCharge" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "Billboard" ALTER COLUMN "price" SET DATA TYPE DECIMAL(15,2),
DROP COLUMN "status",
ADD COLUMN     "status" "BillboardStatus" NOT NULL DEFAULT 'Available',
DROP COLUMN "publishStatus",
ADD COLUMN     "publishStatus" "PublishStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "BillboardHistory" ALTER COLUMN "price" SET DATA TYPE DECIMAL(15,2),
DROP COLUMN "status",
ADD COLUMN     "status" "BillboardStatus" NOT NULL;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "adminFee" DECIMAL(15,2),
ADD COLUMN     "basePrice" DECIMAL(15,2),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "taxAmount" DECIMAL(15,2),
ADD COLUMN     "unitPrice" DECIMAL(15,2),
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "dpAmount" SET DATA TYPE DECIMAL(15,2),
DROP COLUMN "status",
ADD COLUMN     "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
DROP COLUMN "designOption",
ADD COLUMN     "designOption" "DesignOption" NOT NULL,
DROP COLUMN "designStatus",
ADD COLUMN     "designStatus" "DesignStatus",
ALTER COLUMN "refundAmount" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "ChatMessage" DROP COLUMN "sender",
ADD COLUMN     "sender" "ChatSender" NOT NULL;

-- AlterTable
ALTER TABLE "ChatSession" DROP COLUMN "status",
ADD COLUMN     "status" "ChatSessionStatus" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER',
DROP COLUMN "authProvider",
ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'EMAIL';

-- CreateIndex
CREATE INDEX "Billboard_publishStatus_status_idx" ON "Billboard"("publishStatus", "status");

-- CreateIndex
CREATE INDEX "Billboard_createdById_idx" ON "Billboard"("createdById");

-- CreateIndex
CREATE INDEX "Billboard_updatedById_idx" ON "Billboard"("updatedById");

-- CreateIndex
CREATE INDEX "BillboardHistory_billboardId_archivedAt_idx" ON "BillboardHistory"("billboardId", "archivedAt");

-- CreateIndex
CREATE INDEX "BillboardHistory_changedById_idx" ON "BillboardHistory"("changedById");

-- CreateIndex
CREATE INDEX "Booking_userId_status_idx" ON "Booking"("userId", "status");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_billboardId_startDate_endDate_idx" ON "Booking"("billboardId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");
