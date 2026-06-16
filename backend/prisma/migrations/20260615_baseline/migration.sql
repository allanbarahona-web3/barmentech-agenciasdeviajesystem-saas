-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'FACTURACION_COBROS', 'VENTAS', 'OPERACIONES', 'AGENT');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "EmployeeDocumentType" AS ENUM ('CONTRATO', 'CEDULA_FRONTAL', 'CEDULA_TRASERA', 'PASAPORTE', 'LICENCIA', 'INCAPACIDAD', 'CERTIFICADO', 'OTRO');

-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('AIR', 'BUS', 'PRIVATE', 'CRUISE', 'WALKING', 'MIXED');

-- CreateEnum
CREATE TYPE "ContractSource" AS ENUM ('SCHEDULED_TRIP', 'MIGRATION', 'CUSTOM_TRIP', 'QUOTE', 'INTERNAL_TRIP');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT,
    "contractPrefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customDomain" TEXT,
    "emailLogoUrl" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "signatureUrl" TEXT,
    "legalId" TEXT,
    "legalName" TEXT,
    "representativeAddress" TEXT,
    "representativeId" TEXT,
    "representativeMaritalStatus" TEXT,
    "representativeName" TEXT,
    "representativePowers" TEXT,
    "representativeTitle" TEXT,
    "planExpiresAt" TIMESTAMP(3),
    "planType" TEXT DEFAULT 'FREE',
    "suspendReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "business_address" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "contact_whatsapp" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "email_quota_daily" INTEGER NOT NULL DEFAULT 1000,
    "email_quota_monthly" INTEGER NOT NULL DEFAULT 30000,
    "emails_sent_month" INTEGER NOT NULL DEFAULT 0,
    "emails_sent_today" INTEGER NOT NULL DEFAULT 0,
    "fromEmail" TEXT,
    "last_email_reset_date" TIMESTAMP(3),
    "preferred_currency" TEXT NOT NULL DEFAULT 'CRC',
    "replyToEmail" TEXT,
    "website_url" TEXT,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activeJti" TEXT,
    "activeAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'AGENT',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activeJti" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractNumber" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ContractNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "generatedByEmail" TEXT NOT NULL,
    "generatedByName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "pdfObjectKey" TEXT NOT NULL,
    "pdfFileName" TEXT NOT NULL,
    "pdfMimeType" TEXT NOT NULL,
    "pdfSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "signedPdfObjectKey" TEXT,
    "signedPdfFileName" TEXT,
    "signedPdfMimeType" TEXT,
    "signedPdfSize" INTEGER,
    "signedByName" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedClientIp" TEXT,
    "signedUserAgent" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "htmlObjectKey" TEXT,
    "signaturePngObjectKey" TEXT,
    "viewedAt" TIMESTAMP(3),
    "paymentReference" TEXT NOT NULL,
    "contractType" TEXT NOT NULL DEFAULT 'CUSTOM',
    "travelPackageId" TEXT,
    "participantCount" INTEGER NOT NULL DEFAULT 1,
    "source" "ContractSource" NOT NULL DEFAULT 'SCHEDULED_TRIP',
    "tenantId" TEXT NOT NULL,
    "internalTripId" TEXT,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDraft" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "clientFullName" TEXT,
    "clientIdNumber" TEXT,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "destination" TEXT,
    "payload" JSONB NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "generatedByEmail" TEXT NOT NULL,
    "generatedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "source" "ContractSource" NOT NULL DEFAULT 'SCHEDULED_TRIP',
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ContractDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" TEXT,
    "originalFileName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignatureEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "signerKey" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "signedClientIp" TEXT,
    "signedUserAgent" TEXT,
    "signaturePngKey" TEXT,
    "signedPdfKey" TEXT,
    "signedPdfBytes" INTEGER,
    "signedPdfSha256" TEXT,
    "tokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignatureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractUsedToken" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "signerKey" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractUsedToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "verifiedAmount" DECIMAL(14,2) NOT NULL,
    "pendingAmount" DECIMAL(14,2) NOT NULL,
    "balanceAmount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FACTURA_EMITIDA',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "objectKeyPdf" TEXT,
    "pdfFileName" TEXT,
    "pdfMimeType" TEXT,
    "pdfSize" INTEGER,
    "paymentDueDate" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "contractId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ABONO_REPORTADO',
    "bankReference" TEXT,
    "payerName" TEXT,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "verifiedByName" TEXT,
    "rejectionReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "destinationAccountId" TEXT,
    "destinationBank" TEXT,
    "originBank" TEXT,
    "paymentCode" TEXT,
    "receiptDate" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "internalTourBookingId" TEXT,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPaymentAttachment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPaymentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingReceipt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" TEXT NOT NULL,
    "issuedByName" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentToEmail" TEXT,
    "objectKeyPdf" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECIBO_PENDIENTE_VERIFICACION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "BillingReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCreditNote" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NC_EMITIDA',
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" TEXT NOT NULL,
    "issuedByName" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "appliedByUserId" TEXT,
    "appliedByName" TEXT,
    "objectKeyPdf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "BillingCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingClientBalance" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "availableCreditAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "BillingClientBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "sourceIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "buyRate" DECIMAL(10,4) NOT NULL,
    "sellRate" DECIMAL(10,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "setByUserId" TEXT NOT NULL,
    "setByName" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyBankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "sinpeNumber" TEXT,
    "accountHolderName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT 'Empresa',
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReceiptImage" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "extractedData" JSONB NOT NULL,
    "extractedAmount" DECIMAL(14,2),
    "extractedCurrency" TEXT,
    "extractedDate" TIMESTAMP(3),
    "extractedReference" TEXT,
    "extractedOriginBank" TEXT,
    "extractedDestinationBank" TEXT,
    "extractedDestinationAccount" TEXT,
    "extractedPayerName" TEXT,
    "extractedPaymentCode" TEXT,
    "extractedNotes" TEXT,
    "confidenceScore" DECIMAL(5,4),
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "processedAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReceiptImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "occupiedSlots" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "packagePrice" DECIMAL(14,2),
    "priceCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "packageCode" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "minReservation" DECIMAL(14,2),

    CONSTRAINT "TravelPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "monthlySalary" DECIMAL(12,2) NOT NULL,
    "dailySalary" DECIMAL(12,2) NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVO',
    "terminationDate" TIMESTAMP(3),
    "userId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentType" "EmployeeDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "notes" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_trips" (
    "id" TEXT NOT NULL,
    "tripCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "description" TEXT,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "departureTime" TEXT,
    "returnTime" TEXT,
    "capacity" INTEGER NOT NULL,
    "occupiedSlots" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "minReservation" DECIMAL(12,2),
    "transportType" "TransportType" NOT NULL,
    "itinerary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "internal_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_tour_bookings" (
    "id" TEXT NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "internalTripId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pendingAmount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "internal_tour_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_tour_invoices" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pendingAmount" DECIMAL(12,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentDueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "internal_tour_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requireAttendanceForAgente" BOOLEAN NOT NULL DEFAULT true,
    "requireAttendanceForOperador" BOOLEAN NOT NULL DEFAULT true,
    "requireAttendanceForVendedor" BOOLEAN NOT NULL DEFAULT true,
    "requireAttendanceForAdmin" BOOLEAN NOT NULL DEFAULT false,
    "requireAttendanceForContador" BOOLEAN NOT NULL DEFAULT false,
    "break1Duration" INTEGER NOT NULL DEFAULT 15,
    "lunchDuration" INTEGER NOT NULL DEFAULT 60,
    "break2Duration" INTEGER NOT NULL DEFAULT 15,
    "break3Duration" INTEGER NOT NULL DEFAULT 15,
    "regularHours" INTEGER NOT NULL DEFAULT 8,
    "maxOtHours" INTEGER NOT NULL DEFAULT 4,
    "systemHours" JSONB NOT NULL DEFAULT '{"timezone": "America/Costa_Rica", "systemEnd": "20:00", "systemStart": "08:00"}',
    "otEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" TEXT NOT NULL,
    "correctedByUserId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeType" TEXT NOT NULL,
    "beforeClockIn" TIMESTAMP(3) NOT NULL,
    "beforeClockOut" TIMESTAMP(3),
    "beforeDuration" INTEGER,
    "afterType" TEXT NOT NULL,
    "afterClockIn" TIMESTAMP(3) NOT NULL,
    "afterClockOut" TIMESTAMP(3),
    "afterDuration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_daily_summaries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "workingMin" INTEGER NOT NULL DEFAULT 0,
    "meetingMin" INTEGER NOT NULL DEFAULT 0,
    "otMin" INTEGER NOT NULL DEFAULT 0,
    "break1Min" INTEGER NOT NULL DEFAULT 0,
    "break2Min" INTEGER NOT NULL DEFAULT 0,
    "break3Min" INTEGER NOT NULL DEFAULT 0,
    "lunchMin" INTEGER NOT NULL DEFAULT 0,
    "effectiveMin" INTEGER NOT NULL DEFAULT 0,
    "paidMin" INTEGER NOT NULL DEFAULT 0,
    "totalMin" INTEGER NOT NULL DEFAULT 0,
    "excessBreaksMin" INTEGER NOT NULL DEFAULT 0,
    "excessLunchMin" INTEGER NOT NULL DEFAULT 0,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "hasOT" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "duration" INTEGER,
    "exceeded" BOOLEAN NOT NULL DEFAULT false,
    "excessMinutes" INTEGER,
    "isOT" BOOLEAN NOT NULL DEFAULT false,
    "duringOT" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_name_key" ON "tenants"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_contractPrefix_key" ON "tenants"("contractPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_customDomain_key" ON "tenants"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_token_key" ON "password_reset_token"("token");

-- CreateIndex
CREATE INDEX "password_reset_token_userId_idx" ON "password_reset_token"("userId");

-- CreateIndex
CREATE INDEX "password_reset_token_token_idx" ON "password_reset_token"("token");

-- CreateIndex
CREATE INDEX "password_reset_token_expiresAt_idx" ON "password_reset_token"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalUser_email_key" ON "ClientPortalUser"("email");

-- CreateIndex
CREATE INDEX "ClientPortalUser_tenantId_idx" ON "ClientPortalUser"("tenantId");

-- CreateIndex
CREATE INDEX "ClientPortalUser_clientId_idx" ON "ClientPortalUser"("clientId");

-- CreateIndex
CREATE INDEX "ClientPortalUser_email_idx" ON "ClientPortalUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ContractNumber_number_key" ON "ContractNumber"("number");

-- CreateIndex
CREATE INDEX "ContractNumber_createdAt_idx" ON "ContractNumber"("createdAt");

-- CreateIndex
CREATE INDEX "ContractNumber_tenantId_idx" ON "ContractNumber"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractNumber_key" ON "Contract"("contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_paymentReference_key" ON "Contract"("paymentReference");

-- CreateIndex
CREATE INDEX "Contract_clientId_idx" ON "Contract"("clientId");

-- CreateIndex
CREATE INDEX "Contract_travelPackageId_idx" ON "Contract"("travelPackageId");

-- CreateIndex
CREATE INDEX "Contract_internalTripId_idx" ON "Contract"("internalTripId");

-- CreateIndex
CREATE INDEX "Contract_contractType_idx" ON "Contract"("contractType");

-- CreateIndex
CREATE INDEX "Contract_createdAt_idx" ON "Contract"("createdAt");

-- CreateIndex
CREATE INDEX "Contract_tenantId_idx" ON "Contract"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDraft_contractNumber_key" ON "ContractDraft"("contractNumber");

-- CreateIndex
CREATE INDEX "ContractDraft_generatedByUserId_idx" ON "ContractDraft"("generatedByUserId");

-- CreateIndex
CREATE INDEX "ContractDraft_createdAt_idx" ON "ContractDraft"("createdAt");

-- CreateIndex
CREATE INDEX "ContractDraft_tenantId_idx" ON "ContractDraft"("tenantId");

-- CreateIndex
CREATE INDEX "Client_fullName_idx" ON "Client"("fullName");

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Client_tenantId_idx" ON "Client"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_idNumber_tenantId_key" ON "Client"("idNumber", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_objectKey_key" ON "ContractDocument"("objectKey");

-- CreateIndex
CREATE INDEX "ContractDocument_contractId_idx" ON "ContractDocument"("contractId");

-- CreateIndex
CREATE INDEX "ContractDocument_createdAt_idx" ON "ContractDocument"("createdAt");

-- CreateIndex
CREATE INDEX "ContractSignatureEvent_contractId_idx" ON "ContractSignatureEvent"("contractId");

-- CreateIndex
CREATE INDEX "ContractSignatureEvent_signedAt_idx" ON "ContractSignatureEvent"("signedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractUsedToken_tokenHash_key" ON "ContractUsedToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ContractUsedToken_contractId_idx" ON "ContractUsedToken"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_contractId_key" ON "BillingInvoice"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_contractNumber_key" ON "BillingInvoice"("contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_invoiceNumber_key" ON "BillingInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "BillingInvoice_clientId_idx" ON "BillingInvoice"("clientId");

-- CreateIndex
CREATE INDEX "BillingInvoice_status_idx" ON "BillingInvoice"("status");

-- CreateIndex
CREATE INDEX "BillingInvoice_createdAt_idx" ON "BillingInvoice"("createdAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_tenantId_idx" ON "BillingInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "BillingPayment_invoiceId_idx" ON "BillingPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingPayment_contractId_idx" ON "BillingPayment"("contractId");

-- CreateIndex
CREATE INDEX "BillingPayment_internalTourBookingId_idx" ON "BillingPayment"("internalTourBookingId");

-- CreateIndex
CREATE INDEX "BillingPayment_destinationAccountId_idx" ON "BillingPayment"("destinationAccountId");

-- CreateIndex
CREATE INDEX "BillingPayment_paymentCode_idx" ON "BillingPayment"("paymentCode");

-- CreateIndex
CREATE INDEX "BillingPayment_status_idx" ON "BillingPayment"("status");

-- CreateIndex
CREATE INDEX "BillingPayment_reportedAt_idx" ON "BillingPayment"("reportedAt");

-- CreateIndex
CREATE INDEX "BillingPayment_tenantId_idx" ON "BillingPayment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPaymentAttachment_objectKey_key" ON "BillingPaymentAttachment"("objectKey");

-- CreateIndex
CREATE INDEX "BillingPaymentAttachment_paymentId_idx" ON "BillingPaymentAttachment"("paymentId");

-- CreateIndex
CREATE INDEX "BillingPaymentAttachment_createdAt_idx" ON "BillingPaymentAttachment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingReceipt_paymentId_key" ON "BillingReceipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingReceipt_receiptNumber_key" ON "BillingReceipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "BillingReceipt_invoiceId_idx" ON "BillingReceipt"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingReceipt_contractId_idx" ON "BillingReceipt"("contractId");

-- CreateIndex
CREATE INDEX "BillingReceipt_status_idx" ON "BillingReceipt"("status");

-- CreateIndex
CREATE INDEX "BillingReceipt_issuedAt_idx" ON "BillingReceipt"("issuedAt");

-- CreateIndex
CREATE INDEX "BillingReceipt_tenantId_idx" ON "BillingReceipt"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCreditNote_creditNoteNumber_key" ON "BillingCreditNote"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "BillingCreditNote_invoiceId_idx" ON "BillingCreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingCreditNote_contractId_idx" ON "BillingCreditNote"("contractId");

-- CreateIndex
CREATE INDEX "BillingCreditNote_status_idx" ON "BillingCreditNote"("status");

-- CreateIndex
CREATE INDEX "BillingCreditNote_issuedAt_idx" ON "BillingCreditNote"("issuedAt");

-- CreateIndex
CREATE INDEX "BillingCreditNote_tenantId_idx" ON "BillingCreditNote"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingClientBalance_clientId_key" ON "BillingClientBalance"("clientId");

-- CreateIndex
CREATE INDEX "BillingClientBalance_tenantId_idx" ON "BillingClientBalance"("tenantId");

-- CreateIndex
CREATE INDEX "BillingAuditLog_entityType_entityId_idx" ON "BillingAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "BillingAuditLog_actorUserId_idx" ON "BillingAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "BillingAuditLog_createdAt_idx" ON "BillingAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "BillingAuditLog_tenantId_idx" ON "BillingAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "ExchangeRate_date_idx" ON "ExchangeRate"("date");

-- CreateIndex
CREATE INDEX "ExchangeRate_setByUserId_idx" ON "ExchangeRate"("setByUserId");

-- CreateIndex
CREATE INDEX "ExchangeRate_tenantId_idx" ON "ExchangeRate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_tenantId_key" ON "ExchangeRate"("date", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBankAccount_accountNumber_key" ON "CompanyBankAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_bankName_idx" ON "CompanyBankAccount"("bankName");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_currency_idx" ON "CompanyBankAccount"("currency");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_isActive_idx" ON "CompanyBankAccount"("isActive");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_companyName_idx" ON "CompanyBankAccount"("companyName");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_createdAt_idx" ON "CompanyBankAccount"("createdAt");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_tenantId_idx" ON "CompanyBankAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceiptImage_paymentId_key" ON "PaymentReceiptImage"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceiptImage_objectKey_key" ON "PaymentReceiptImage"("objectKey");

-- CreateIndex
CREATE INDEX "PaymentReceiptImage_paymentId_idx" ON "PaymentReceiptImage"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentReceiptImage_processingStatus_idx" ON "PaymentReceiptImage"("processingStatus");

-- CreateIndex
CREATE INDEX "PaymentReceiptImage_createdAt_idx" ON "PaymentReceiptImage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravelPackage_packageCode_key" ON "TravelPackage"("packageCode");

-- CreateIndex
CREATE INDEX "TravelPackage_departureDate_idx" ON "TravelPackage"("departureDate");

-- CreateIndex
CREATE INDEX "TravelPackage_status_idx" ON "TravelPackage"("status");

-- CreateIndex
CREATE INDEX "TravelPackage_createdAt_idx" ON "TravelPackage"("createdAt");

-- CreateIndex
CREATE INDEX "TravelPackage_packageCode_idx" ON "TravelPackage"("packageCode");

-- CreateIndex
CREATE INDEX "TravelPackage_tenantId_idx" ON "TravelPackage"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_tenantId_idx" ON "employees"("tenantId");

-- CreateIndex
CREATE INDEX "employees_tenantId_status_idx" ON "employees"("tenantId", "status");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_position_idx" ON "employees"("position");

-- CreateIndex
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex
CREATE INDEX "employees_userId_idx" ON "employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_documentId_key" ON "employees"("tenantId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_documents_objectKey_key" ON "employee_documents"("objectKey");

-- CreateIndex
CREATE INDEX "employee_documents_employeeId_idx" ON "employee_documents"("employeeId");

-- CreateIndex
CREATE INDEX "employee_documents_tenantId_idx" ON "employee_documents"("tenantId");

-- CreateIndex
CREATE INDEX "employee_documents_documentType_idx" ON "employee_documents"("documentType");

-- CreateIndex
CREATE INDEX "employee_documents_uploadedAt_idx" ON "employee_documents"("uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "internal_trips_tripCode_key" ON "internal_trips"("tripCode");

-- CreateIndex
CREATE INDEX "internal_trips_departureDate_idx" ON "internal_trips"("departureDate");

-- CreateIndex
CREATE INDEX "internal_trips_tenantId_idx" ON "internal_trips"("tenantId");

-- CreateIndex
CREATE INDEX "internal_trips_status_idx" ON "internal_trips"("status");

-- CreateIndex
CREATE INDEX "internal_trips_tripCode_idx" ON "internal_trips"("tripCode");

-- CreateIndex
CREATE UNIQUE INDEX "internal_tour_bookings_bookingCode_key" ON "internal_tour_bookings"("bookingCode");

-- CreateIndex
CREATE INDEX "internal_tour_bookings_internalTripId_idx" ON "internal_tour_bookings"("internalTripId");

-- CreateIndex
CREATE INDEX "internal_tour_bookings_clientId_idx" ON "internal_tour_bookings"("clientId");

-- CreateIndex
CREATE INDEX "internal_tour_bookings_tenantId_idx" ON "internal_tour_bookings"("tenantId");

-- CreateIndex
CREATE INDEX "internal_tour_bookings_status_idx" ON "internal_tour_bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "internal_tour_bookings_internalTripId_clientId_tenantId_key" ON "internal_tour_bookings"("internalTripId", "clientId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "internal_tour_invoices_bookingId_key" ON "internal_tour_invoices"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "internal_tour_invoices_invoiceNumber_key" ON "internal_tour_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "internal_tour_invoices_bookingId_idx" ON "internal_tour_invoices"("bookingId");

-- CreateIndex
CREATE INDEX "internal_tour_invoices_tenantId_idx" ON "internal_tour_invoices"("tenantId");

-- CreateIndex
CREATE INDEX "internal_tour_invoices_invoiceNumber_idx" ON "internal_tour_invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_config_tenantId_key" ON "attendance_config"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_config_tenantId_idx" ON "attendance_config"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_corrections_correctedByUserId_idx" ON "attendance_corrections"("correctedByUserId");

-- CreateIndex
CREATE INDEX "attendance_corrections_entryId_idx" ON "attendance_corrections"("entryId");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenantId_idx" ON "attendance_corrections"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_tenantId_userId_date_idx" ON "attendance_daily_summaries"("tenantId", "userId", "date");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_userId_date_idx" ON "attendance_daily_summaries"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_daily_summaries_tenantId_userId_date_key" ON "attendance_daily_summaries"("tenantId", "userId", "date");

-- CreateIndex
CREATE INDEX "attendance_entries_date_idx" ON "attendance_entries"("date");

-- CreateIndex
CREATE INDEX "attendance_entries_tenantId_userId_date_idx" ON "attendance_entries"("tenantId", "userId", "date");

-- CreateIndex
CREATE INDEX "attendance_entries_userId_date_idx" ON "attendance_entries"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_tenantId_userId_date_type_clockIn_key" ON "attendance_entries"("tenantId", "userId", "date", "type", "clockIn");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalUser" ADD CONSTRAINT "ClientPortalUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalUser" ADD CONSTRAINT "ClientPortalUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractNumber" ADD CONSTRAINT "ContractNumber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_internalTripId_fkey" FOREIGN KEY ("internalTripId") REFERENCES "internal_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_travelPackageId_fkey" FOREIGN KEY ("travelPackageId") REFERENCES "TravelPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDraft" ADD CONSTRAINT "ContractDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignatureEvent" ADD CONSTRAINT "ContractSignatureEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractUsedToken" ADD CONSTRAINT "ContractUsedToken_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_internalTourBookingId_fkey" FOREIGN KEY ("internalTourBookingId") REFERENCES "internal_tour_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentAttachment" ADD CONSTRAINT "BillingPaymentAttachment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingClientBalance" ADD CONSTRAINT "BillingClientBalance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingClientBalance" ADD CONSTRAINT "BillingClientBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAuditLog" ADD CONSTRAINT "BillingAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBankAccount" ADD CONSTRAINT "CompanyBankAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceiptImage" ADD CONSTRAINT "PaymentReceiptImage_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelPackage" ADD CONSTRAINT "TravelPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_trips" ADD CONSTRAINT "internal_trips_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_bookings" ADD CONSTRAINT "internal_tour_bookings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_bookings" ADD CONSTRAINT "internal_tour_bookings_internalTripId_fkey" FOREIGN KEY ("internalTripId") REFERENCES "internal_trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_bookings" ADD CONSTRAINT "internal_tour_bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_invoices" ADD CONSTRAINT "internal_tour_invoices_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "internal_tour_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_invoices" ADD CONSTRAINT "internal_tour_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_config" ADD CONSTRAINT "attendance_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_correctedByUserId_fkey" FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "attendance_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

