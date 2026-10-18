export const PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApYMsjV56YBTGs1+qEpkKCTEZIow+jWb09kIuJ/ULAUrp74OmdVkfORgmvf06rm1SmXvAxbDPpELK8PI+c4QqgQXEQH0O3+WQIlw3LLg8+zAnQfS+KM2k3Q0eg5mHVrtjZZQNV2fgVLqtehrzxu3LpfyGa16wUU+MTLHcB6MRsTOSs5W+jNzEovkaUv28DEuxSrICGNfAWK3JTzfJqp03rZZODXYxGeUf3bKKz6z1RP4TKXw36gMjEfFiHzucXwv8lkOuIwEVYxN3HAN3uhdLlDPehfy/lvvGWxc7RX1xpSFUxHcxCev778CMVV240fMbQFbGOI2ttO8Ix2lJVlDOXQIDAQAB";

export async function seal(value, origin, spki = PUBLIC_KEY) {
  const publicKey = await crypto.subtle.importKey(
    "spki",
    Uint8Array.from(atob(spki), character => character.charCodeAt(0)),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  if (publicKey.algorithm.modulusLength !== 2048) {
    throw new Error("The broker requires a 2048-bit RSA public key.");
  }
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ s: value, o: origin }));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plain);
  const wrapped = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" }, publicKey, await crypto.subtle.exportKey("raw", aesKey)
  );

  // Broker wire format: RSA-wrapped key (256), IV (12), GCM ciphertext and tag.
  const all = new Uint8Array(256 + 12 + cipher.byteLength);
  all.set(new Uint8Array(wrapped), 0);
  all.set(iv, 256);
  all.set(new Uint8Array(cipher), 268);
  return btoa(Array.from(all, byte => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
