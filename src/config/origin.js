// Plain JS so both Expo config loading and the RN bundle use exactly the same rules.
/** @param {string | undefined} value @returns {string} */
function parseApiOrigin(value) {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["", "/", "/api/v1", "/api/v1/"].includes(url.pathname)
    )
      return "";
    return url.origin;
  } catch {
    return "";
  }
}

/** @param {string} host @returns {boolean} */
function isPrivateHost(host) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name === "::1" ||
    name === "::" ||
    (name.startsWith("fc") && name.includes(":")) ||
    (name.startsWith("fd") && name.includes(":")) ||
    /^fe[89ab][0-9a-f]:/.test(name) ||
    name.startsWith("::ffff:")
  )
    return true;
  const octets = name.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every(Number.isInteger) &&
    (octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168))
  );
}

module.exports = { parseApiOrigin, isPrivateHost };
