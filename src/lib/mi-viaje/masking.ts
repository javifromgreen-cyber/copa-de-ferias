/**
 * Mi Viaje shows a traveler's own document only to that booking's
 * authorized viewer — but even then, the full number is never shown at
 * rest on screen (§12): only the last 4 characters, matching how a
 * boarding pass or bank card is normally displayed.
 */
export function maskDocNumber(docNumber: string): string {
  const trimmed = docNumber.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 4) return "*".repeat(trimmed.length);
  return "****" + trimmed.slice(-4);
}
