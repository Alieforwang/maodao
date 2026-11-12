export interface SecretBox {
  available: boolean;
  encrypt(plain: string): string;
  decrypt(payload: string): string;
}

export function unavailableSecretBox(): SecretBox {
  return {
    available: false,
    encrypt() {
      throw new Error("ENCRYPTION_UNAVAILABLE");
    },
    decrypt() {
      throw new Error("ENCRYPTION_UNAVAILABLE");
    },
  };
}
