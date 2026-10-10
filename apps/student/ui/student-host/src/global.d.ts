import type { StudentHostApi } from "./types";

type ElectronCompatApi = StudentHostApi;

declare global {
  interface Window {
    studentHost: StudentHostApi;
    electronAPI?: Partial<ElectronCompatApi>;
  }
}

export {};
