/**
 * Hybrid encryption utilities using Web Crypto API
 *
 * Encryption flow:
 * 1. Generate AES key for data encryption
 * 2. Encrypt data with AES-GCM
 * 3. Encrypt AES key with RSA-OAEP public key
 * 4. Store: encrypted data + encrypted AES key + IV
 *
 * Decryption flow:
 * 1. Derive RSA private key from password
 * 2. Decrypt AES key with RSA private key
 * 3. Decrypt data with AES key
 */

// Generate RSA key pair for encryption
export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );

  const publicKeyBuffer = await crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey,
  );
  const privateKeyBuffer = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey,
  );

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

// Derive key from password using PBKDF2
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Encrypt private key with password
export async function encryptPrivateKey(
  privateKey: string,
  password: string,
): Promise<{ encryptedPrivateKey: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await deriveKeyFromPassword(password, salt, 600000);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    encoder.encode(privateKey),
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  return {
    encryptedPrivateKey: arrayBufferToBase64(combined.buffer),
    salt: `v2:${arrayBufferToBase64(salt.buffer)}`,
  };
}

// Decrypt private key with password
export async function decryptPrivateKey(
  encryptedPrivateKey: string,
  salt: string,
  password: string,
): Promise<string> {
  const current = salt.startsWith("v2:");
  const saltBuffer = base64ToArrayBuffer(current ? salt.slice(3) : salt);
  const derivedKey = await deriveKeyFromPassword(
    password,
    new Uint8Array(saltBuffer),
    current ? 600000 : 100000,
  );

  const combined = new Uint8Array(base64ToArrayBuffer(encryptedPrivateKey));
  const iv = combined.slice(0, 12);
  const encryptedData = combined.slice(12);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    encryptedData,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Encrypt data with public key (hybrid encryption)
export async function encryptData(
  data: string,
  publicKeyBase64: string,
): Promise<string> {
  // Generate random AES key
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  // Encrypt data with AES
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encryptedDataBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(data),
  );

  // Export AES key
  const aesKeyBuffer = await crypto.subtle.exportKey("raw", aesKey);

  // Import public key
  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
  const publicKey = await crypto.subtle.importKey(
    "spki",
    publicKeyBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );

  // Encrypt AES key with RSA
  const encryptedAesKeyBuffer = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    aesKeyBuffer,
  );

  // Package: encryptedAesKey length (2 bytes) + encryptedAesKey + IV + encryptedData
  const encryptedAesKey = new Uint8Array(encryptedAesKeyBuffer);
  const encryptedData = new Uint8Array(encryptedDataBuffer);

  const result = new Uint8Array(
    2 + encryptedAesKey.length + iv.length + encryptedData.length,
  );
  const keyLength = encryptedAesKey.length;
  result[0] = (keyLength >> 8) & 0xff;
  result[1] = keyLength & 0xff;
  result.set(encryptedAesKey, 2);
  result.set(iv, 2 + encryptedAesKey.length);
  result.set(encryptedData, 2 + encryptedAesKey.length + iv.length);

  return arrayBufferToBase64(result.buffer);
}

// Decrypt data with private key (hybrid decryption)
export async function decryptData(
  encryptedDataBase64: string,
  privateKeyBase64: string,
): Promise<string> {
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedDataBase64));

  // Parse: encryptedAesKey length (2 bytes) + encryptedAesKey + IV + encryptedData
  const keyLength = (combined[0] << 8) | combined[1];
  const encryptedAesKey = combined.slice(2, 2 + keyLength);
  const iv = combined.slice(2 + keyLength, 2 + keyLength + 12);
  const encryptedData = combined.slice(2 + keyLength + 12);

  // Import private key
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );

  // Decrypt AES key
  const aesKeyBuffer = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedAesKey,
  );

  // Import AES key
  const aesKey = await crypto.subtle.importKey(
    "raw",
    aesKeyBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  // Decrypt data
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encryptedData,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Verify password by attempting to decrypt private key
export async function verifyPassword(
  encryptedPrivateKey: string,
  salt: string,
  password: string,
): Promise<boolean> {
  try {
    await decryptPrivateKey(encryptedPrivateKey, salt, password);
    return true;
  } catch {
    return false;
  }
}

// Check if file content is encrypted using YAML frontmatter
export function isEncryptedFile(content: string): boolean {
  return /^---\r?\nencrypted:\s*true/.test(content);
}

// Wrap encrypted data with YAML frontmatter format
export interface EncryptedFileMetadata {
  description?: string;
  publicMetadata?: Record<string, string>;
}

function normalizedPublicMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key, entry]) =>
      key.trim() && typeof entry === "string" &&
      !["description", "__proto__", "prototype", "constructor"].includes(
        key.trim(),
      )
    ),
  );
}

export function wrapEncryptedFile(
  data: string,
  key: string,
  salt: string,
  metadata: EncryptedFileMetadata = {},
): string {
  const description = metadata.description?.trim();
  const publicMetadata = normalizedPublicMetadata(metadata.publicMetadata);
  const metadataLines = [
    description ? `description: ${JSON.stringify(description)}` : "",
    Object.keys(publicMetadata).length
      ? `publicMetadata: ${JSON.stringify(publicMetadata)}`
      : "",
  ].filter(Boolean).join("\n");
  return `---\nencrypted: true\n${
    metadataLines ? `${metadataLines}\n` : ""
  }key: ${key}\nsalt: ${salt}\n---\n${data}`;
}

// Extract encryption info from YAML frontmatter format
export function unwrapEncryptedFile(
  content: string,
): {
  data: string;
  key: string;
  salt: string;
  description: string;
  publicMetadata: Record<string, string>;
} | null {
  // Normalize line endings to \n for reliable parsing
  const normalized = content.replace(/\r\n/g, "\n");
  const frontmatter = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatter) return null;

  const keyMatch = frontmatter[1].match(/key:\s*(.+)/);
  const saltMatch = frontmatter[1].match(/salt:\s*(.+)/);
  if (!keyMatch || !saltMatch) return null;

  const descriptionMatch = frontmatter[1].match(/^description:\s*(.*)$/m),
    publicMetadataMatch = frontmatter[1].match(/^publicMetadata:\s*(.*)$/m);
  let description = "", publicMetadata: Record<string, string> = {};
  if (descriptionMatch) {
    try {
      const parsed = JSON.parse(descriptionMatch[1].trim());
      description = typeof parsed === "string" ? parsed : "";
    } catch {
      description = descriptionMatch[1].trim();
    }
  }
  if (publicMetadataMatch) {
    try {
      publicMetadata = normalizedPublicMetadata(
        JSON.parse(publicMetadataMatch[1].trim()),
      );
    } catch {
      publicMetadata = {};
    }
  }
  return {
    key: keyMatch[1].trim(),
    salt: saltMatch[1].trim(),
    data: frontmatter[2].trim(),
    description,
    publicMetadata,
  };
}

export function getEncryptedFileMetadata(
  content: string,
): EncryptedFileMetadata {
  const encrypted = unwrapEncryptedFile(content);
  return encrypted
    ? {
      description: encrypted.description,
      publicMetadata: encrypted.publicMetadata,
    }
    : {};
}

export function setEncryptedFileMetadata(
  content: string,
  metadata: EncryptedFileMetadata,
): string {
  const encrypted = unwrapEncryptedFile(content);
  if (!encrypted) throw new Error("Invalid encrypted file format");
  return wrapEncryptedFile(
    encrypted.data,
    encrypted.key,
    encrypted.salt,
    metadata,
  );
}

// Encrypt file content and wrap with YAML frontmatter
export async function encryptFileContent(
  content: string,
  publicKey: string,
  encryptedPrivateKey: string,
  salt: string,
  metadata: EncryptedFileMetadata = {},
): Promise<string> {
  // Prevent double-encryption
  if (unwrapEncryptedFile(content)) {
    return content;
  }
  const encryptedData = await encryptData(content, publicKey);
  return wrapEncryptedFile(encryptedData, encryptedPrivateKey, salt, metadata);
}

// Decrypt file content from YAML frontmatter format
export async function decryptFileContent(
  fileContent: string,
  password: string,
): Promise<string> {
  const encrypted = unwrapEncryptedFile(fileContent);
  if (!encrypted) {
    throw new Error("Invalid encrypted file format");
  }

  const privateKey = await decryptPrivateKey(
    encrypted.key,
    encrypted.salt,
    password,
  );
  return decryptData(encrypted.data, privateKey);
}

/** Re-encrypt an existing compatible file while retaining its password-protected private key. */
export async function reencryptFileContent(
  fileContent: string,
  nextContent: string,
  password: string,
): Promise<string> {
  const encrypted = unwrapEncryptedFile(fileContent);
  if (!encrypted) throw new Error("Invalid encrypted file format");
  const privateKeyBase64 = await decryptPrivateKey(
    encrypted.key,
    encrypted.salt,
    password,
  );
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    base64ToArrayBuffer(privateKeyBase64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"],
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: privateJwk.kty,
      n: privateJwk.n,
      e: privateJwk.e,
      alg: "RSA-OAEP-256",
      ext: true,
      key_ops: ["encrypt"],
    },
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"],
  );
  const publicKeyBase64 = arrayBufferToBase64(
    await crypto.subtle.exportKey("spki", publicKey),
  );
  return await encryptFileContent(
    nextContent,
    publicKeyBase64,
    encrypted.key,
    encrypted.salt,
    {
      description: encrypted.description,
      publicMetadata: encrypted.publicMetadata,
    },
  );
}

// Utility functions
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
