/*
  Warnings:

  - A unique constraint covering the columns `[sessionId,documentKey]` on the table `document_signings` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `documentKey` to the `document_signings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "document_signings" ADD COLUMN     "documentKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "document_signings_sessionId_documentKey_key" ON "document_signings"("sessionId", "documentKey");
