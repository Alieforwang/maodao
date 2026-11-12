import { safeStorage } from "electron";
import { unavailableSecretBox, type SecretBox } from "../shared/secrets.js";

export function createSecretBox(): SecretBox {
  if (!safeStorage.isEncryptionAvailable()) return unavailableSecretBox();
  return {
    available: true,
    encrypt(plain: string) {
      return safeStorage.encryptString(plain).toString("base64");
    },
    decrypt(payload: string) {
      return safeStorage.decryptString(Buffer.from(payload, "base64"));
    },
  };
}
