/// <reference types="vite/client" />
import type { PreflightApi } from "@shared/types";

declare global {
  interface Window {
    api: PreflightApi;
  }
}
export {};
