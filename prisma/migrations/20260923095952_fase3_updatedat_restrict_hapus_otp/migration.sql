/*
  Warnings:

  - You are about to drop the column `otpCode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `otpExpires` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AdditionalCharge" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "BillboardHistory" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "otpCode",
DROP COLUMN "otpExpires",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
