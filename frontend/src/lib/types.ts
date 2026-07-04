/**
 * Shared TypeScript types for the End Customer Project feature.
 * Mirrors the Prisma schema + DTOs in the backend so the rest of
 * the app can talk about projects / selections / measurements /
 * documents / visualisations without redefining the shapes.
 */

export type ProjectType = 'RESIDENTIAL' | 'COMMERCIAL';
export type InstallScope = 'FULL' | 'HALF' | 'PARTIAL';
export type ProjectStatus = 'DRAFT' | 'SUBMITTED' | 'QUOTED' | 'APPROVED' | 'INSTALLED' | 'CANCELLED';
export type ProjectDocumentKind = 'SITE_PHOTO' | 'FLOOR_PLAN' | 'PROPERTY_DEED' | 'REFERENCE_IMAGE' | 'OTHER';
export type ProjectVisualizationKind = 'AI_IMAGE' | 'AI_3D_SNAPSHOT' | 'TOPDOWN_COMPOSITE';

export interface ProjectDocument {
  id: string;
  kind: ProjectDocumentKind;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  widthPx?: number | null;
  heightPx?: number | null;
  uploadedAt: string;
  caption?: string | null;
}

export interface ProjectFenceSelection {
  id: string;
  productId: string;
  designId?: string | null;
  linearMeters: number;
  heightFt: number;
  panelCount?: number | null;
  gateCount?: number | null;
  notes?: string | null;
  sortOrder: number;
  product?: { id: string; name: string };
  design?: { id: string; name: string } | null;
}

export interface ProjectMeasurement {
  id: string;
  label: string;
  lengthM: number;
  heightFt: number;
  widthM?: number | null;
  slopeDeg?: number | null;
  notes?: string | null;
}

export interface ProjectVisualization {
  id: string;
  kind: ProjectVisualizationKind;
  mimeType: string;
  prompt?: string | null;
  modelUsed?: string | null;
  widthPx?: number | null;
  heightPx?: number | null;
  generatedAt: string;
}

export interface Project {
  id: string;
  dealerId: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  projectType: ProjectType;
  installScope: InstallScope;
  status: ProjectStatus;
  totalLinearMeters?: number | null;
  totalAreaSqM?: number | null;
  notes?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  documents?: ProjectDocument[];
  selections?: ProjectFenceSelection[];
  measurements?: ProjectMeasurement[];
  visualizations?: ProjectVisualization[];
  quotes?: { id: string; reference: string }[];
  _count?: { documents: number; selections: number; measurements: number; visualizations: number };
}

// ---------------------------------------------------------------------------
// Installation traceability
// ---------------------------------------------------------------------------

export type InstallationStatus =
  | 'SCHEDULED'
  | 'MATERIALS_ORDERED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'INSPECTED'
  | 'CANCELLED';

export type InstallationEventType =
  | 'SCHEDULED'
  | 'KICKOFF'
  | 'MATERIALS_ORDERED'
  | 'MATERIALS_RECEIVED'
  | 'POSTS_SET'
  | 'PANELS_HUNG'
  | 'GATE_INSTALLED'
  | 'PHOTO_UPLOADED'
  | 'NOTE_ADDED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'INSPECTED'
  | 'CUSTOMER_APPROVED'
  | 'CANCELLED'
  | 'PUBLIC_LINK_ISSUIED';

export type InstallationPhotoKind = 'BEFORE' | 'DURING' | 'AFTER' | 'ISSUE';

export type InstallationLinkPurpose = 'STATUS_UPDATE' | 'COMPLETION_REVIEW' | 'ALL';

/** Allowed next-status map, mirrors backend dto.ts. */
export const INSTALLATION_TRANSITIONS: Record<InstallationStatus, InstallationStatus[]> = {
  SCHEDULED: ['MATERIALS_ORDERED', 'IN_PROGRESS', 'CANCELLED'],
  MATERIALS_ORDERED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['INSPECTED', 'CANCELLED'],
  INSPECTED: [],
  CANCELLED: [],
};

export interface InstallationEvent {
  id: string;
  type: InstallationEventType;
  actorKind: string;
  actorLabel?: string | null;
  note?: string | null;
  occurredAt: string;
  metadata?: Record<string, any> | null;
}

export interface InstallationPhoto {
  id: string;
  kind: InstallationPhotoKind;
  caption?: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  widthPx?: number | null;
  heightPx?: number | null;
  uploadedByKind: 'INSTALLER' | 'WHOLESALER' | 'CUSTOMER';
  uploadedByLabel?: string | null;
  takenAt?: string | null;
  uploadedAt: string;
}

export interface PublicCustomerLink {
  id: string;
  token: string;
  purpose: InstallationLinkPurpose;
  revokedAt?: string | null;
  lastViewedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface Installation {
  id: string;
  quoteId: string;
  status: InstallationStatus;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  installerName?: string | null;
  installerPhone?: string | null;
  installerEmail?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  inspectedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  events?: InstallationEvent[];
  photos?: InstallationPhoto[];
  customerLinks?: PublicCustomerLink[];
  quote?: {
    id: string;
    reference: string;
    customerName: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    projectAddress?: string | null;
    status: string;
  } | null;
}
