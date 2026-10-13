/**
 * Splits a `Co-authored-by:` trailer into its parts:
 * `"Claude Fable 5 <noreply@anthropic.com>"` → name + email.
 *
 * Keeping the email (rather than the display name alone) is what lets a
 * co-author resolve through the very same `resolveContributor` an author goes
 * through — so alias groups, `displayName`/`url` overrides and kind derivation
 * apply identically whether a person wrote a commit or helped with one.
 */
export const parseIdentity = (
  identity: string,
): { name: string; email: string } => {
  const open = identity.indexOf("<");
  const close = identity.lastIndexOf(">");
  if (open === -1 || close < open) {
    return { name: identity.trim(), email: "" };
  }
  return {
    name: identity.slice(0, open).trim(),
    email: identity.slice(open + 1, close).trim(),
  };
};
