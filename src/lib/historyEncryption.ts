import {
  decryptFileContent,
  encryptFileContent,
  encryptPrivateKey,
  generateKeyPair,
  verifyPassword,
} from "./hybridEncryption";
import { readProjectStateFile, writeProjectStateFile } from "./wailsBackend";

const PROFILE_KEY = "gemihub-desktop:history-encryption-profile";
const PREFS_KEY = "gemihub-desktop:history-encryption-preferences";

interface Profile { publicKey: string; encryptedPrivateKey: string; salt: string }
export interface HistoryEncryptionPreferences { chat: boolean; workflow: boolean }

let sessionPassword = "";

function profile(): Profile | null {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null") as Profile | null; } catch { return null; }
}

export function historyEncryptionPreferences(): HistoryEncryptionPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as Partial<HistoryEncryptionPreferences>;
    return { chat: value.chat === true, workflow: value.workflow === true };
  } catch { return { chat: false, workflow: false }; }
}

export function setHistoryEncryptionPreferences(value: HistoryEncryptionPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event("llm-hub:history-encryption-changed"));
}

export function historyEncryptionConfigured(): boolean { return profile() !== null; }
export function historyEncryptionUnlocked(): boolean { return !!sessionPassword; }

export async function configureOrUnlockHistoryEncryption(password: string): Promise<void> {
  const current = profile();
  if (current) {
    if (!await verifyPassword(current.encryptedPrivateKey, current.salt, password)) throw new Error("Password is incorrect.");
    sessionPassword = password;
    window.dispatchEvent(new Event("llm-hub:history-encryption-unlocked"));
    return;
  }
  const keys = await generateKeyPair();
  const protectedKey = await encryptPrivateKey(keys.privateKey, password);
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ publicKey: keys.publicKey, encryptedPrivateKey: protectedKey.encryptedPrivateKey, salt: protectedKey.salt }));
  sessionPassword = password;
  window.dispatchEvent(new Event("llm-hub:history-encryption-unlocked"));
}

export async function encryptHistoryPayload(content: string, kind: "chat-history" | "workflow-log"): Promise<string> {
  const current = profile();
  if (!current) throw new Error("History encryption is not configured.");
  return encryptFileContent(content, current.publicKey, current.encryptedPrivateKey, current.salt, { publicMetadata: { sourceKind: kind } });
}

export async function decryptHistoryPayload(content: string, password = sessionPassword): Promise<string> {
  if (!password) throw new Error("History encryption is locked.");
  const result = await decryptFileContent(content, password);
  sessionPassword = password;
  return result;
}

export function historySessionPassword(): string { return sessionPassword; }

export async function migrateWorkflowHistoryStorage(encrypt: boolean): Promise<void> {
  const value = await readProjectStateFile("workflow-history");
  if (value) {
    const encrypted = value.startsWith("---\nencrypted: true");
    if (encrypt && !encrypted) await writeProjectStateFile("workflow-history", await encryptHistoryPayload(value, "workflow-log"));
    if (!encrypt && encrypted) await writeProjectStateFile("workflow-history", await decryptHistoryPayload(value));
  }
  window.dispatchEvent(new CustomEvent("llm-hub:workflow-history-changed", { detail: { reload: true } }));
}
