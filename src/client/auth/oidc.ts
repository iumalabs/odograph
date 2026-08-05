// A plain full-page navigation, not a fetch-driven ceremony — Google's own consent screen and
// redirect handle the rest. Exported as a constant so App.tsx doesn't hardcode the path.
export const GOOGLE_SIGN_IN_URL = "/api/v1/auth/oidc/google/start";

/** Requires an authenticated session — see GET /api/v1/auth/oidc/google/link (specs/005). */
export const GOOGLE_LINK_URL = "/api/v1/auth/oidc/google/link";
