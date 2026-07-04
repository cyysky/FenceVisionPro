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
  wholesalerId: string;
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
