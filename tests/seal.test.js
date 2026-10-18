import { test } from "node:test";
import assert from "node:assert/strict";
import {
  constants, createDecipheriv, createHash, createPublicKey, generateKeyPairSync, privateDecrypt
} from "node:crypto";
import { PUBLIC_KEY, seal } from "../assets/seal.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const origin = "https://oneot.github.io";

function unwrap(bytes) {
  return privateDecrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256"
  }, bytes.subarray(0, 256));
}

function decrypt(bytes) {
  const decipher = createDecipheriv("aes-256-gcm", unwrap(bytes), bytes.subarray(256, 268));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(268, -16)), decipher.final()]).toString("utf8");
}

test("retains the deployed RSA-2048 public key", () => {
  const der = Buffer.from(PUBLIC_KEY, "base64");
  assert.equal(createHash("sha256").update(der).digest("hex"),
    "d123dc7b75d2561be2e2d3b51c09934194352b105928246f7860ee7abbc07de7");
  assert.equal(createPublicKey({ key: der, type: "spki", format: "der" })
    .asymmetricKeyDetails.modulusLength, 2048);
});

test("round-trips UTF-8 JSON with the exact broker byte layout and AES-256 key", async () => {
  const secret = "회귀검증용-더미-비밀-1234567890";
  const plain = JSON.stringify({ s: secret, o: origin });
  const sealed = await seal(secret, origin, spki);
  const bytes = Buffer.from(sealed, "base64url");

  assert.match(sealed, /^[A-Za-z0-9_-]+$/);
  assert.equal(bytes.length, 256 + 12 + Buffer.byteLength(plain) + 16);
  assert.equal(unwrap(bytes).length, 32);
  assert.equal(decrypt(bytes), plain);
  assert.deepEqual(JSON.parse(decrypt(bytes)), { s: secret, o: origin });
});

test("uses a fresh AES key and IV for every seal", async () => {
  const first = Buffer.from(await seal("dummy-secret", origin, spki), "base64url");
  const second = Buffer.from(await seal("dummy-secret", origin, spki), "base64url");
  assert.notDeepEqual(first, second);
  assert.notDeepEqual(unwrap(first), unwrap(second));
  assert.notDeepEqual(first.subarray(256, 268), second.subarray(256, 268));
});

test("GCM authenticates the ciphertext and IV", async () => {
  const bytes = Buffer.from(await seal("dummy-secret", origin, spki), "base64url");
  for (const offset of [256, 268, bytes.length - 1]) {
    const modified = Buffer.from(bytes);
    modified[offset] ^= 1;
    assert.throws(() => decrypt(modified));
  }
});

test("encodes large inputs without overflowing the JavaScript argument stack", async () => {
  const secret = "검증".repeat(30000);
  const bytes = Buffer.from(await seal(secret, origin, spki), "base64url");
  assert.deepEqual(JSON.parse(decrypt(bytes)), { s: secret, o: origin });
});

test("the default public key produces the same fixed-size envelope", async () => {
  const secret = "dummy-secret";
  const bytes = Buffer.from(await seal(secret, origin), "base64url");
  assert.equal(bytes.length, 268 + Buffer.byteLength(JSON.stringify({ s: secret, o: origin })) + 16);
});

test("rejects invalid keys and keys incompatible with the broker layout", async () => {
  await assert.rejects(seal("dummy-secret", origin, "invalid-key"));
  const key = generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey;
  const incompatible = key.export({ type: "spki", format: "der" }).toString("base64");
  await assert.rejects(seal("dummy-secret", origin, incompatible), /2048-bit/);
});
