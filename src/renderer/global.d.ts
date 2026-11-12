import type { MadaoApi } from "../main/preload.js";

declare global {
  interface Window {
    madao?: MadaoApi;
    __madao?: {
      openAdd: () => void;
      openSettings: () => void;
      openAccounts: () => void;
    };
  }
}

export {};
