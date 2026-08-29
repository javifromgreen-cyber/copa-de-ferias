// Kept outside any "use server" module — a server action file may only
// export async functions, so this plain constant lives here and is
// imported by both the action that sets it (lookupTripAccess) and the
// page that reads it (/mi-viaje).
export const MI_VIAJE_COOKIE_NAME = "mv_last_token";
