import manifest from "../../.release-please-manifest.json";

// Sourced from release-please's own manifest (docs/deployment.md) rather than a hand-maintained
// constant — whatever version was current when this bundle was built, baked in at build time.
export const APP_VERSION: string = manifest["."];
