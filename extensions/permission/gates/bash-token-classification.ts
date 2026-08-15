export function classifyTokenAsPathCandidate(token: string): string | null {
  if (rejectNonPathToken(token)) return null;

  if (token.startsWith("/")) return token;
  if (token.startsWith("~/")) return token;
  if (token.includes("..")) return token;

  return null;
}
export function classifyTokenAsRuleCandidate(token: string): string | null {
  if (rejectNonPathToken(token)) return null;

  if (token.startsWith(".")) return token;
  if (token.includes("/")) return token;
  if (token.includes("..")) return token;

  return null;
}

const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const REGEX_METACHAR_PATTERN = /\.\*|\.\+|\\\||\\\(|\\\)|\[.*?\]|\^\//;
const BARE_SLASH_PATTERN = /^\/+$/;

const TOKEN_REJECTORS: Array<(token: string) => boolean> = [
  (token) => !token,
  (token) => token.startsWith("-"),
  isEnvAssignmentToken,
  (token) => URL_PATTERN.test(token),
  isScopedPackageToken,
  (token) => BARE_SLASH_PATTERN.test(token),
  (token) => REGEX_METACHAR_PATTERN.test(token),
];

function rejectNonPathToken(token: string): boolean {
  return TOKEN_REJECTORS.some((rejects) => rejects(token));
}

function isEnvAssignmentToken(token: string): boolean {
  const eqIndex = token.indexOf("=");
  const slashIndex = token.indexOf("/");
  return eqIndex !== -1 && (slashIndex === -1 || eqIndex < slashIndex);
}

function isScopedPackageToken(token: string): boolean {
  return token.startsWith("@") && !token.startsWith("@/");
}
