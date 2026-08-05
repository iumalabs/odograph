// fido2-helpers ships no types and its fixture shapes are wider than what
// @simplewebauthn/server's RegistrationResponseJSON/AuthenticationResponseJSON
// expect (see tests/server/fixtures/webauthn.ts's adapters) — typed as `any`
// deliberately rather than hand-modeling a third-party test-fixture package's
// internals; this file is test-only and never imported from src/.
// deno-lint-ignore-file no-explicit-any
declare module "fido2-helpers" {
  const helpers: any;
  export default helpers;
}
