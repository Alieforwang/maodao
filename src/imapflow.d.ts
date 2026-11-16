declare module "imapflow" {
  import { EventEmitter } from "node:events";
  export class ImapFlow extends EventEmitter {
    constructor(options: Record<string, unknown>);
    capabilities: Map<string, unknown>;
    mailbox: false | { uidNext?: number; path?: string; exists?: number };
    connect(): Promise<void>;
    logout(): Promise<void>;
    list(): Promise<Array<{ name: string; path: string; specialUse?: string }>>;
    close(): void;
    idle(): Promise<boolean | void>;
    noop(): Promise<void>;
    getMailboxLock(path: string): Promise<{ release(): void }>;
    fetchAll(range: string, query: Record<string, unknown>, options?: { uid?: boolean }): Promise<Array<{ uid: number; internalDate?: Date; source?: Buffer; envelope?: { subject?: string; from?: Array<{ name?: string; address?: string }> } }>>;
    fetchOne(range: string, query: Record<string, unknown>, options?: { uid?: boolean }): Promise<{ uid: number } | false>;
  }
}
