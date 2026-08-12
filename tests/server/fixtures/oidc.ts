// Moved to src/server/auth/oidc/fixture.ts (specs/032) so the dev-only fixture-signin route
// (dev-oidc.ts) can reach it too, alongside this test suite — re-exported here so no existing
// import in this test tree needs to change.
export {
  FIXTURE_AUDIENCE,
  fixtureJwks,
  signFixtureIdToken,
} from "../../../src/server/auth/oidc/fixture";
