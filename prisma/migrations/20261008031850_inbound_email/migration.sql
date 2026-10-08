-- CreateEnum
CREATE TYPE "InboundEmailKind" AS ENUM ('APPLICATION_CONFIRMATION', 'INTERVIEW', 'REJECTION', 'OFFER', 'NOT_JOB_RELATED', 'GMAIL_FORWARDING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "InboundEmailState" AS ENUM ('UPDATED', 'NEEDS_REVIEW', 'IGNORED', 'FAILED', 'UNDONE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inboundToken" TEXT;

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT NOT NULL,
    "forwardingCode" TEXT,
    "kind" "InboundEmailKind",
    "confidence" DOUBLE PRECISION,
    "company" TEXT,
    "jobTitle" TEXT,
    "companyDomain" TEXT,
    "interviewAt" TIMESTAMP(3),
    "summary" TEXT,
    "state" "InboundEmailState" NOT NULL,
    "reviewReason" TEXT,
    "applicationId" TEXT,
    "createdApplication" BOOLEAN NOT NULL DEFAULT false,
    "previousStatus" "ApplicationStatus",
    "previousDateApplied" DATE,
    "appliedStatus" "ApplicationStatus",
    "eventIds" TEXT[],
    "applicationUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundEmail_userId_state_createdAt_idx" ON "InboundEmail"("userId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_userId_messageId_key" ON "InboundEmail"("userId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "User_inboundToken_key" ON "User"("inboundToken");

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

