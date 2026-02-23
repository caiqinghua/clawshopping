import { createHash, generateKeyPairSync, verify } from "crypto";

export function generateAgentKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  };
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildSigningPayload(input: {
  method: string;
  path: string;
  timestamp: string;
  bodyHash?: string;
}): string {
  return [input.method.toUpperCase(), input.path, input.timestamp, input.bodyHash ?? ""].join("\n");
}

export function verifyAgentSignature(input: {
  publicKeyPem: string;
  payload: string;
  signatureBase64: string;
}) {
  try {
    const signature = Buffer.from(input.signatureBase64, "base64");
    return verify(null, Buffer.from(input.payload), input.publicKeyPem, signature);
  } catch {
    return false;
  }
}
