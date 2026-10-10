export type ComponentPack = {
  format: 'lumesync-component-pack';
  formatVersion: '1.0.0';
  id: string;
  version: string;
  displayName: string;
  description?: string;
  components: Array<{
    id: string;
    label: string;
    description?: string;
    props: Record<string, { type: 'string' | 'number' | 'boolean' | 'color' | 'enum'; label: string; default: unknown; required?: boolean; maxLength?: number; min?: number; max?: number; options?: string[] }>;
    template: Record<string, unknown>;
  }>;
};
export class ComponentPackError extends Error { code: string; details: Record<string, unknown>; }
export function validateComponentPack(pack: unknown): ComponentPack;
export function componentPackHash(pack: ComponentPack): string;
export function createStarterComponentPack(id: string, displayName: string, version?: string): ComponentPack;
export function validateComponentProps(component: ComponentPack['components'][number], props: unknown): unknown;
export function readComponentPack(input: Buffer | Uint8Array): Promise<{ pack: ComponentPack; hash: string; text: string }>;
export function writeComponentPack(pack: ComponentPack, options?: { outputType?: 'nodebuffer' | 'uint8array' | 'blob' }): Promise<Buffer | Uint8Array | Blob>;
