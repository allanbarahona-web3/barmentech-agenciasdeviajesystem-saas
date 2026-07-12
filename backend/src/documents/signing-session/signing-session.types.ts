/**
 * Generic signing session domain models
 *
 * These types define the shape of multi-document signing workflows
 * independent of any specific document type (contracts, waivers, etc.)
 */

/**
 * Represents one participant in a signing session
 */
export interface SigningParticipant {
  /** Unique identifier for the signer within the process */
  signerKey: string;
  /** Full name of the signer */
  name: string;
  /** Email address for sending signing links */
  email: string | null;
  /** Role of the signer in the process */
  role: string;
}

/**
 * Represents one document within a signing session
 */
export interface SigningDocumentDefinition {
  /** Business entity identifier (e.g., contract UUID) */
  id: string;
  /** Stable key uniquely identifying this document within the session */
  key: string;
  /** Type of document (contract, waiver, authorization, etc.) */
  type: string;
  /** Human-readable name for the document */
  displayName: string;
  /** List of participants who must sign this document */
  signers: SigningParticipant[];
}

/**
 * Represents the plan for a complete signing session
 *
 * A session may involve multiple documents and multiple signers.
 * This plan defines what needs to be signed and by whom.
 */
export interface SigningSessionPlan {
  /** Unique identifier for the business process (e.g., contract ID) */
  processId: string;
  /** Type of business process (e.g., "contract", "waiver") */
  processType: string;
  /** List of documents to be signed in this session */
  documents: SigningDocumentDefinition[];
}

/**
 * Represents one signing link for a document-signer pair
 */
export interface SigningLink {
  /** Document identifier */
  documentId: string;
  /** Document type */
  documentType: string;
  /** Signer identifier */
  signerKey: string;
  /** Signer role */
  signerRole: string;
  /** Signer name */
  signerName: string;
  /** Signer email */
  signerEmail: string | null;
  /** Complete signing URL with token */
  signingUrl: string;
  /** Token expiration timestamp */
  expiresAt: Date;
}

/**
 * Context for starting a signing session
 */
export interface SigningSessionContext {
  /** Base URL for generating signing links */
  baseUrl: string;
  /** Time-to-live in minutes (default: 1440 = 24 hours) */
  ttlMinutes?: number;
  /** Document display name for email template */
  documentDisplayName?: string;
  /** Actor triggering the session */
  actor?: {
    id: string;
    email: string;
    fullName: string;
  };
  /** Tenant context for email branding */
  tenant?: {
    id: string;
    name: string;
    subdomain: string | null;
    emailLogoUrl: string | null;
    logoUrl: string | null;
  } | null;
}

/**
 * Represents the result of starting a signing session
 *
 * Contains metadata about what was created and what actions were taken.
 */
export interface SigningSessionResult {
  /** Number of documents prepared for signing */
  generatedDocuments: number;
  /** Number of signing links generated */
  generatedLinks: number;
  /** Number of emails successfully sent */
  emailsSent: number;
  /** Number of emails that failed to send */
  emailsFailed: number;
  /** List of email addresses that failed */
  failedEmails: string[];
  /** Generated signing links for all document-signer pairs */
  signingLinks: SigningLink[];
}

/**
 * Represents the signing progress of a session
 *
 * Tracks how many signers have completed their signatures
 * and who is still pending.
 */
export interface SigningProgress {
  /** Total number of required signers */
  totalSigners: number;
  /** Number of signers who have completed their signature */
  signedCount: number;
  /** Number of signers still pending */
  pendingCount: number;
  /** Whether all required signatures are complete */
  completed: boolean;
  /** List of signer keys that have not yet signed */
  pendingSignerKeys: string[];
}

/**
 * Represents the finalization state of a signing session
 *
 * Indicates whether a session should be finalized and what
 * signatures are still pending.
 */
export interface SigningSessionFinalization {
  /** Whether the session should be finalized (all signatures complete) */
  shouldFinalize: boolean;
  /** Whether signatures are still pending */
  hasPendingSignatures: boolean;
  /** List of signer keys that have not yet signed */
  pendingSignerKeys: string[];
}
