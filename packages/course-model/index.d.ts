import type { ComponentPack } from '../component-extensions';

export type CoreComponentType = 'core.heading' | 'core.paragraph' | 'core.bullets' | 'core.callout';
export type ComponentType = CoreComponentType | (string & {});
export interface ComponentExtensionRef { id: string; version: string; hash: string; }
export interface ComponentPackEntry { pack: ComponentPack; hash: string; }
export interface CourseModelOptions { componentPacks?: Array<ComponentPack | ComponentPackEntry> | Map<string, ComponentPack | ComponentPackEntry>; }
export interface CourseBlock { id: string; type: ComponentType; props: Record<string, unknown>; }
export interface CoursePage { id: string; title: string; blocks: CourseBlock[]; }
export interface CourseTheme { background: string; surface: string; text: string; accent: string; }
export interface CourseDocument {
  format: 'lumesync-course-document';
  formatVersion: '1.0.0';
  id: string;
  title: string;
  description: string;
  aspectRatio: '16:9';
  theme: CourseTheme;
  pages: CoursePage[];
  extensions?: ComponentExtensionRef[];
}
export interface CourseIssue { path: string; code: string; message: string; }
export interface CourseSnapshot { revision: number; document: CourseDocument; canUndo: boolean; canRedo: boolean; }
export interface CourseCandidate { baseRevision: number; commands: CourseCommand[]; document: CourseDocument; diff: CourseDiff; }
export type CourseCommand =
  | { type: 'course.update'; patch: Partial<Pick<CourseDocument, 'title' | 'description' | 'theme'>> }
  | { type: 'course.extension.add'; extension: ComponentExtensionRef }
  | { type: 'course.extension.remove'; id: string; version: string }
  | { type: 'page.add'; page: Partial<CoursePage> & { title: string; blocks?: CourseBlock[] }; index?: number }
  | { type: 'page.update'; pageId: string; patch: { title: string } }
  | { type: 'page.move'; pageId: string; toIndex: number }
  | { type: 'page.remove'; pageId: string }
  | { type: 'block.add'; pageId: string; block: Partial<CourseBlock> & { type: ComponentType; props: Record<string, unknown> }; index?: number }
  | { type: 'block.update'; pageId: string; blockId: string; patch: Partial<Pick<CourseBlock, 'type' | 'props'>> }
  | { type: 'block.move'; pageId: string; blockId: string; toIndex: number }
  | { type: 'block.remove'; pageId: string; blockId: string };
export interface CourseDiff { titleChanged: boolean; addedPages: string[]; removedPages: string[]; changedPages: string[]; pageOrderChanged: boolean; }
export class CourseModelError extends Error { code: string; details: Record<string, unknown>; }
export const DOCUMENT_FORMAT: 'lumesync-course-document';
export const DOCUMENT_VERSION: '1.0.0';
export const MAX_PAGES: number;
export const MAX_BLOCKS_PER_PAGE: number;
export const componentDefinitions: Record<CoreComponentType, { label: string; defaults: Record<string, unknown> }>;
export function getComponentCatalog(componentPacks?: CourseModelOptions['componentPacks'], extensionRefs?: ComponentExtensionRef[]): Record<string, { label: string; description?: string; props: string[]; fields?: ComponentPack['components'][number]['props']; defaults: Record<string, unknown>; extension?: { id: string; version: string; hash: string }; template?: Record<string, unknown> }>;
export function makeId(prefix?: string): string;
export function clone<T>(value: T): T;
export function validateCourseDocument(input: unknown, options?: CourseModelOptions): { ok: boolean; errors: CourseIssue[]; value: CourseDocument | null };
export function assertValidCourseDocument(input: unknown, options?: CourseModelOptions): CourseDocument;
export function createCourseDocument(input?: Partial<CourseDocument>, options?: { validate?: boolean }): CourseDocument;
export function applyCommand(document: CourseDocument, command: CourseCommand, options?: CourseModelOptions): CourseDocument;
export function applyCommands(document: CourseDocument, commands: CourseCommand[], options?: CourseModelOptions): CourseDocument;
export function diffDocuments(before: CourseDocument, after: CourseDocument): CourseDiff;
export function stableStringify(value: unknown): string;
export function createDocumentStore(document: CourseDocument, options?: CourseModelOptions): {
  snapshot(): CourseSnapshot;
  componentPacks(): ComponentPackEntry[];
  registerComponentPack(entry: ComponentPack | ComponentPackEntry): { id: string; version: string; hash: string; components: Array<{ id: string; label: string }> };
  dispatch(command: CourseCommand, options?: { expectedRevision?: number }): CourseSnapshot;
  dispatchBatch(commands: CourseCommand[], options?: { expectedRevision?: number; label?: string }): CourseSnapshot;
  undo(options?: { expectedRevision?: number }): CourseSnapshot;
  redo(options?: { expectedRevision?: number }): CourseSnapshot;
  createCandidate(commands: CourseCommand[], options?: { expectedRevision?: number }): CourseCandidate;
  acceptCandidate(candidate: CourseCandidate, options?: { expectedRevision?: number }): CourseSnapshot;
};
export function escapeHtml(text: string): string;
export function renderBlockHtml(block: CourseBlock, options?: CourseModelOptions): string;
export function renderPageHtml(document: CourseDocument, pageId: string, options?: CourseModelOptions): string;
export function compilePageTsx(document: CourseDocument, pageId: string, options?: CourseModelOptions): string;
export function sourceFilesForDocument(document: CourseDocument, options?: CourseModelOptions): Map<string, string>;
export function buildCourseDocument(document: CourseDocument, options?: CourseModelOptions): Promise<{
  pages: Array<{ id: string; title: string; file: string }>;
  files: Map<string, string>;
}>;
