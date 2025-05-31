declare module 'mime' {
  export function getType(path: string): string | null;
  export function getExtension(type: string): string | null;
  export function define(types: Record<string, string[]>): void;
  export const default_type: string;
}
