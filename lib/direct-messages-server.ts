import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const DIRECT_MESSAGE_ENCRYPTION_PREFIX = "dmenc.v1";
const DIRECT_MESSAGE_IV_LENGTH = 12;

const getDirectMessageEncryptionKey = () => {
  const configuredKey = process.env.DIRECT_MESSAGES_ENCRYPTION_KEY?.trim() ?? "";
  if (!configuredKey) {
    throw new Error("Direct message encryption is not configured. Set DIRECT_MESSAGES_ENCRYPTION_KEY on the server.");
  }

  return createHash("sha256").update(configuredKey).digest();
};

export const encryptDirectMessage = (message: string) => {
  const ivBuffer = randomBytes(DIRECT_MESSAGE_IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getDirectMessageEncryptionKey(), ivBuffer);
  const encrypted = Buffer.concat([cipher.update(message, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    DIRECT_MESSAGE_ENCRYPTION_PREFIX,
    ivBuffer.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
};

export const decryptDirectMessage = (value?: string | null) => {
  const storedValue = value ?? "";
  if (!storedValue.startsWith(`${DIRECT_MESSAGE_ENCRYPTION_PREFIX}:`)) {
    return storedValue;
  }

  const [, ivPart, authTagPart, encryptedPart] = storedValue.split(":");
  if (!ivPart || !authTagPart || !encryptedPart) {
    throw new Error("Stored direct message is malformed.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getDirectMessageEncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};
