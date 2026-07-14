import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ArchiveContractDto } from "./dto/archive-contract.dto";
import { CreateSigningLinkDto } from "./dto/create-signing-link.dto";
import { FinalizeContractSignaturePublicDto } from "./dto/finalize-contract-signature-public.dto";

import { PublicSigningSessionDto } from "./dto/public-signing-session.dto";
import { SearchContractsDto } from "./dto/search-contracts.dto";
import { ContractsService } from "./contracts.service";
import { SendContractEmailDto } from "./dto/send-contract-email.dto";
import { SendSigningEmailDto } from "./dto/send-signing-email.dto";
import { SaveContractDraftDto } from "./dto/save-contract-draft.dto";
import { Tenant } from "../tenant/tenant.decorator";
import { ResolvedTenant } from "../tenant/tenant.service";
import { ContractNotesService } from "./notes/contract-notes.service";
import { CreateContractNoteDto, CreateContractNoteForCustomerDto } from "./dto/create-contract-note.dto";
import { UpdateContractNoteDto } from "./dto/update-contract-note.dto";

@Controller("contracts")
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly contractNotesService: ContractNotesService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Post("next-number")
  reserveNextNumber(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Tenant() tenant: ResolvedTenant,
  ) {
    return this.contractsService.reserveNextNumber(req.user, tenant);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Post("send-email")
  @UseInterceptors(FileInterceptor("pdfFile"))
  sendContractEmail(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Body() dto: SendContractEmailDto,
    @Tenant() tenant: ResolvedTenant,
    @UploadedFile()
    file?: {
      buffer: Buffer;
      mimetype: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException("Debes adjuntar el archivo PDF.");
    }

    if (file.mimetype !== "application/pdf") {
      throw new BadRequestException("El adjunto debe ser un PDF.");
    }

    if (!file.buffer?.length) {
      throw new BadRequestException("El PDF adjunto esta vacio.");
    }

    return this.contractsService.sendContractEmail(req.user, dto, file.buffer, tenant);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Post("drafts")
  saveDraft(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Body() dto: SaveContractDraftDto,
  ) {
    return this.contractsService.saveContractDraft(req.user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Get("drafts/:draftId")
  getDraft(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("draftId") draftId: string,
  ) {
    return this.contractsService.getContractDraft(req.user, draftId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Delete("drafts/:draftId")
  deleteDraft(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("draftId") draftId: string,
  ) {
    return this.contractsService.deleteContractDraft(req.user, draftId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Post("archive")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "documents", maxCount: 20 },
      ],
      {
        limits: {
          fieldSize: 5 * 1024 * 1024, // 5MB para campos de texto (contractHtml, payloadJson)
          fileSize: 10 * 1024 * 1024, // 10MB por archivo adjunto
        },
      },
    ),
  )
  archiveContract(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Body() dto: ArchiveContractDto,
    @UploadedFiles()
    files: {
      documents?: Array<{
        buffer: Buffer;
        mimetype: string;
        originalname: string;
        size: number;
      }>;
    },
  ) {
    return this.contractsService.archiveContract(
      req.user,
      dto,
      files?.documents || [],
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT", "ADMIN")
  @Post(":contractId/send-signing-links")
  sendSigningLinks(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("contractId") contractId: string,
  ) {
    return this.contractsService.sendSigningLinksForContract(req.user, contractId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Post(":contractId/send-to-billing")
  sendContractToBilling(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("contractId") contractId: string,
  ) {
    return this.contractsService.sendContractToBillingSystem(req.user, contractId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  searchContracts(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Query() query: SearchContractsDto,
  ) {
    return this.contractsService.searchContracts(req.user, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":contractId/files")
  getContractFiles(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("contractId") contractId: string,
  ) {
    return this.contractsService.getContractFiles(req.user, contractId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Post(":contractId/signing-link")
  createSigningLink(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("contractId") contractId: string,
    @Body() dto: CreateSigningLinkDto,
  ) {
    return this.contractsService.createContractSigningLink(req.user, contractId, dto.ttlMinutes);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Post("send-signing-email")
  sendSigningEmail(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Body() dto: SendSigningEmailDto,
    @Tenant() tenant: ResolvedTenant,
  ) {
    return this.contractsService.sendContractSigningEmail(req.user, dto, tenant);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT")
  @Post(":contractId/resend-signed-email")
  resendSignedEmail(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("contractId") contractId: string,
    @Tenant() tenant: ResolvedTenant,
  ) {
    return this.contractsService.resendSignedContractEmailToParties(req.user, contractId, tenant);
  }

  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Get("public/signing-session")
  getPublicSigningSession(
    @Req() req: { ip?: string },
    @Query() query: PublicSigningSessionDto,
  ) {
    return this.contractsService.getPublicSigningSession(query.token, req.ip || null);
  }

  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post("public/mark-viewed")
  markContractViewed(
    @Req() req: { ip?: string },
    @Body() body: { token?: string },
  ) {
    const token = String(body?.token || "").trim();
    if (!token) {
      throw new BadRequestException("Se requiere el token.");
    }
    return this.contractsService.markContractViewed(token, req.ip || null);
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post("public/finalize-signature")
  finalizePublicContractSignature(
    @Req()
    req: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Body() dto: FinalizeContractSignaturePublicDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.contractsService.finalizeContractSignatureByToken(
      dto.token,
      dto.signedByName,
      dto.signatureImageBase64,
      req.ip || null,
      userAgent || null,
    );
  }

  // ========== Contract Notes Endpoints ==========

  /**
   * POST /contracts/:contractId/notes
   * Create a new note for a contract passenger
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT", "ADMIN")
  @Post(":contractId/notes")
  createContractNote(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("contractId") contractId: string,
    @Body() dto: CreateContractNoteDto,
  ) {
    return this.contractNotesService.createContractNote(
      req.user.tenantId,
      contractId,
      dto.passengerType,
      dto.passengerIndex ?? null,
      dto.passengerName,
      dto.note,
      req.user.id,
      req.user.fullName,
    );
  }

  /**
   * POST /contracts/:contractId/notes/for-customer
   * Create a note for a customer's participation in a contract
   * Passenger identity is derived automatically from customer-contract participation
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT", "ADMIN")
  @Post(":contractId/notes/for-customer")
  createContractNoteForCustomer(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("contractId") contractId: string,
    @Body() dto: CreateContractNoteForCustomerDto,
  ) {
    return this.contractNotesService.createContractNoteForCustomer(
      req.user.tenantId,
      contractId,
      dto.customerId,
      dto.note,
      req.user.id,
      req.user.fullName,
    );
  }

  /**
   * GET /contracts/:contractId/notes
   * List all notes for a contract
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT", "ADMIN", "FACTURACION_COBROS")
  @Get(":contractId/notes")
  listContractNotes(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("contractId") contractId: string,
    @Query("includeArchived") includeArchived?: string,
  ) {
    const includeArchivedBool = includeArchived === "true";
    return this.contractNotesService.listContractNotes(
      req.user.tenantId,
      contractId,
      includeArchivedBool,
    );
  }

  /**
   * PATCH /contracts/:contractId/notes/:noteId
   * Update a contract note
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT", "ADMIN")
  @Post(":contractId/notes/:noteId")
  updateContractNote(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("contractId") contractId: string,
    @Param("noteId") noteId: string,
    @Body() dto: UpdateContractNoteDto,
  ) {
    return this.contractNotesService.updateContractNote(
      req.user.tenantId,
      contractId,
      noteId,
      dto.note,
    );
  }

  /**
   * DELETE /contracts/:contractId/notes/:noteId
   * Delete a contract note (admin only)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Delete(":contractId/notes/:noteId")
  deleteContractNote(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("contractId") contractId: string,
    @Param("noteId") noteId: string,
  ) {
    return this.contractNotesService.deleteContractNote(
      req.user.tenantId,
      contractId,
      noteId,
    );
  }

  /**
   * GET /contracts/operational-notes/customer/:customerId
   * Get all operational notes for a customer (across all their contracts)
   * Used in customer profile "Notas Operativas" section
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("AGENT", "ADMIN", "FACTURACION_COBROS")
  @Get("operational-notes/customer/:customerId")
  listCustomerOperationalNotes(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("customerId") customerId: string,
  ) {
    return this.contractNotesService.listCustomerOperationalNotes(
      req.user.tenantId,
      customerId,
    );
  }
}
