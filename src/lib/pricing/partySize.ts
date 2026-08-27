// A_TU_AIRE party-size rules (§12/§156): 1 to 10 travelers per booking,
// inclusive. 11+ is always rejected, both client- and server-side.
export const MIN_PARTY_SIZE = 1;
export const MAX_PARTY_SIZE = 10;

export function isValidPartySize(partySize: number): boolean {
  return Number.isInteger(partySize) && partySize >= MIN_PARTY_SIZE && partySize <= MAX_PARTY_SIZE;
}
