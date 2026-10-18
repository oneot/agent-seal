const validId = id => id.length <= 39 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);

export function githubId(value) {
  const input = value.trim().toLowerCase();
  const bare = input.replace(/^@/, "");
  if (validId(bare)) return bare;
  if (input.startsWith("@") || /[\s\\]/.test(input)) return null;

  let url;
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) {
    return null;
  }

  let id;
  if (url.hostname === "github.com" || url.hostname === "www.github.com") {
    id = url.pathname.split("/")[1];
  } else if (url.hostname.endsWith(".github.io")) {
    id = url.hostname.slice(0, -".github.io".length);
  } else {
    return null;
  }
  return validId(id) ? id : null;
}
