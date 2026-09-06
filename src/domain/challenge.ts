import type { AnchorChallenge, PermissionScope } from "./types";

export function generateSixDigitCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashChallengeCode(
  challengeId: string,
  code: string,
): Promise<string> {
  return sha256(`${challengeId}:${code}`);
}

export async function revealChallenge(
  challenge: AnchorChallenge,
  now = Date.now(),
): Promise<{ challenge: AnchorChallenge; code: string }> {
  if (challenge.state !== "awaiting_reveal" && challenge.state !== "revealed") {
    throw new Error("当前锚点码不可显示");
  }
  const code = generateSixDigitCode();
  const codeHash = await hashChallengeCode(challenge.id, code);
  return {
    code,
    challenge: {
      ...challenge,
      codeHash,
      state: "revealed",
      revealedAt: now,
    },
  };
}

export async function verifyChallenge(input: {
  challenge: AnchorChallenge;
  code: string;
  sessionId: string;
  siteKey: string;
  tabId: number;
  scope: PermissionScope;
}): Promise<boolean> {
  const { challenge } = input;
  if (challenge.state !== "revealed" || !challenge.codeHash) return false;
  if (
    challenge.sessionId !== input.sessionId ||
    challenge.siteKey !== input.siteKey ||
    challenge.tabId !== input.tabId ||
    JSON.stringify(challenge.permissionScope) !== JSON.stringify(input.scope)
  ) {
    return false;
  }
  return (await hashChallengeCode(challenge.id, input.code)) === challenge.codeHash;
}
