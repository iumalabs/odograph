// A plain full-page navigation, not a fetch-driven ceremony — the provider's own consent/sign-in
// screen and redirect handle the rest. Exported as constants so App.tsx doesn't hardcode paths.
export const GOOGLE_SIGN_IN_URL = "/api/v1/auth/oidc/google/start";
export const CLOUDFLARE_SIGN_IN_URL = "/api/v1/auth/oidc/cloudflare/start";

/** Requires an authenticated session — see GET /api/v1/auth/oidc/{provider}/link (specs/005). */
export const GOOGLE_LINK_URL = "/api/v1/auth/oidc/google/link";
export const CLOUDFLARE_LINK_URL = "/api/v1/auth/oidc/cloudflare/link";
