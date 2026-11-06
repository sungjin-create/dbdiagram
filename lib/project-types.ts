export type Saved = {
  title: string;
  dbml: string;
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
  edgeColors?: Record<string, string>;
};
export type Project = Saved & { id: string; folderId: string | null; tableNames: string[]; updatedAt: string };
export type Library = { folders: { id: string; name: string }[]; projects: Project[]; activeId: string | null };
export const emptyLibrary = (): Library => ({ folders: [], projects: [], activeId: null });
export const localLibraryKey = 'schema-studio-projects-v1';
export const localDraftKey = 'schema-studio-v1';
