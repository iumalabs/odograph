// In-app documentation content (specs/057-in-app-documentation). Every factual claim here is
// checked against the real implementation, not carried over from the Claude Design mockup's
// placeholder copy (which describes a Cloudflare Access / Docker deployment this app doesn't
// have — see research.md's per-section source table). Structured as `{ en: [...] }`, deliberately
// ready for a parallel `ru` array the same way `strings.ts` is ready for a parallel `ru` object
// (Constitution Principle IX — see plan.md's Constitution Check for why this file, not individual
// `t()` keys, is the right shape for long-form prose).

export type DocBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: Array<{ label: string; text: string }> }
  | { kind: "code"; text: string }
  | { kind: "note"; text: string };

export type DocSection = {
  id: string;
  number: string;
  kicker: string;
  title: string;
  lead: string;
  blocks: DocBlock[];
};

export const en: DocSection[] = [
  {
    id: "getting-started",
    number: "01",
    kicker: "GETTING STARTED",
    title: "What odograph does",
    lead:
      "odograph is a maintenance log for your vehicles — fill-ups, service history, reminders, a work planner, a photo gallery, and documents, all in one place.",
    blocks: [
      { kind: "heading", text: "What's inside" },
      {
        kind: "list",
        items: [
          {
            label: "Garage — ",
            text:
              "a card per vehicle: odometer, cost per distance, average fuel economy, and the next thing due.",
          },
          {
            label: "Fuel — ",
            text: "a quick form that computes economy and total cost from your odometer readings.",
          },
          {
            label: "Service — ",
            text: "a log of work done, with parts, cost, and who did it.",
          },
          {
            label: "Reminders — ",
            text: "by distance and by date; marking one done adds it to your service log.",
          },
          {
            label: "Planner — ",
            text: "a kanban board — ideas, to buy, in progress, done — for work you're planning.",
          },
          {
            label: "Gallery and documents — ",
            text: "photos by category, and scans of documents with expiry tracking.",
          },
        ],
      },
      { kind: "heading", text: "Getting a vehicle in" },
      {
        kind: "paragraph",
        text:
          "Add a vehicle from the Garage screen, by VIN lookup or by hand. Its odometer doesn't need to be exact up front — it updates from your first fill-up or service entry.",
      },
      {
        kind: "note",
        text:
          "Distance unit (km/mi) and currency are per-viewer preferences, switchable any time from the header — they don't change what's stored, only how it's displayed.",
      },
    ],
  },
  {
    id: "signing-in",
    number: "02",
    kicker: "ACCOUNTS",
    title: "Signing in",
    lead:
      "There's no password. Every account signs in with one of three methods, and every new sign-up gets its own private, fully isolated account immediately.",
    blocks: [
      { kind: "heading", text: "The three methods" },
      {
        kind: "list",
        items: [
          {
            label: "Passkey — ",
            text:
              "the primary method. Your device (Touch ID, Windows Hello, a security key) proves who you are — nothing to remember, nothing that can be phished.",
          },
          {
            label: "Magic link — ",
            text:
              "a sign-in link emailed to you, valid for 15 minutes and usable once. No account setup beyond an email address.",
          },
          {
            label: "Google — ",
            text: "sign in with an existing Google account.",
          },
        ],
      },
      {
        kind: "paragraph",
        text:
          "You can add more than one method to the same account later — for example, register a passkey on a second device, or link an additional email address or Google account — from the Garage screen once signed in.",
      },
      { kind: "heading", text: "Your data" },
      {
        kind: "paragraph",
        text:
          "Every account's data is fully isolated from every other account's — nothing is shared by default. You can permanently delete your account and everything in it from Account; this is immediate and cannot be undone.",
      },
    ],
  },
  {
    id: "fuel-and-consumption",
    number: "03",
    kicker: "FUEL",
    title: "Fuel and consumption",
    lead:
      "Fuel economy and cost-per-distance are computed for you from your fill-up history — you only enter what's on the receipt.",
    blocks: [
      { kind: "heading", text: "How it's computed" },
      {
        kind: "paragraph",
        text:
          'Each fill-up records an odometer reading, a volume, and (optionally) a cost. Fuel economy for a given fill-up is the distance since the previous one (by odometer reading, not by date) divided by the volume — every fill-up counts, there\'s no "only full tanks" restriction to remember.',
      },
      {
        kind: "note",
        text:
          "Entries are matched by odometer order, not entry order — logging a missed fill-up after the fact still slots it into the right place in the sequence.",
      },
      { kind: "heading", text: "Units and currency" },
      {
        kind: "paragraph",
        text:
          "Switch between km/L and mi/gal, and between currencies, from the header at any time — this only changes how figures are displayed, not what's stored.",
      },
    ],
  },
  {
    id: "service-and-reminders",
    number: "04",
    kicker: "MAINTENANCE",
    title: "Service, reminders, and the planner",
    lead:
      "Reminders and the planner both feed the same service log — they're two ways of getting a job onto it, not separate systems.",
    blocks: [
      { kind: "heading", text: "How reminders trigger" },
      {
        kind: "paragraph",
        text:
          "A reminder watches both distance and date at once, whichever comes first. Marking one done creates a service-log entry for it automatically, using your vehicle's current odometer reading.",
      },
      { kind: "heading", text: "The planner" },
      {
        kind: "paragraph",
        text:
          'The planner is a kanban board — Ideas, To buy, In progress, Done — for work you\'re planning rather than something already due. Moving a card to "Done" creates a service-log entry for it too, carrying over its price if it had one.',
      },
      { kind: "heading", text: "Documents" },
      {
        kind: "paragraph",
        text:
          "Documents (insurance, inspection certificates, and similar) can have an expiry date — a reminder appears as that date approaches, the same way a distance-based reminder does.",
      },
    ],
  },
  {
    id: "api-access",
    number: "05",
    kicker: "AUTOMATION",
    title: "API access",
    lead:
      "For scripting or home automation, you can create a scoped API token from Account and call the same REST API the app itself uses.",
    blocks: [
      { kind: "heading", text: "Creating a token" },
      {
        kind: "paragraph",
        text:
          "Give it a label and a scope — read or write — from Account. The token is shown once at creation time; store it yourself, since it isn't shown again.",
      },
      { kind: "heading", text: "Using it" },
      {
        kind: "code",
        text:
          'curl https://your-instance.example/api/v1/vehicles \\\n  -H "Authorization: Bearer <your-token>"',
      },
      {
        kind: "note",
        text:
          "A read-scoped token can't perform writes, even if you construct the request yourself. Revoke a token any time from Account — it stops working immediately.",
      },
    ],
  },
  {
    id: "self-hosting",
    number: "06",
    kicker: "DEPLOYMENT",
    title: "Self-hosting",
    lead:
      "odograph runs entirely on Cloudflare's free-tier-friendly stack (Workers, D1, R2, KV). You can deploy your own instance to your own Cloudflare account.",
    blocks: [
      { kind: "heading", text: "How it's deployed" },
      {
        kind: "paragraph",
        text:
          "Deployment is plain `wrangler` commands run from your own machine against your own Cloudflare account — there's no Docker image, and no third-party auth gateway sits in front of the app.",
      },
      {
        kind: "list",
        items: [
          { label: "Provision — ", text: "one D1 database, one KV namespace, one R2 bucket." },
          {
            label: "Migrate — ",
            text: "apply the bundled migrations to set up the schema.",
          },
          {
            label: "Configure — ",
            text:
              "Google sign-in is optional; email sending (magic-link and reminder mail) needs Cloudflare Email Routing enabled on a domain you control.",
          },
          { label: "Deploy — ", text: "build and `wrangler deploy`. Your instance is live." },
        ],
      },
      {
        kind: "note",
        text:
          "This is a summary — the full step-by-step, including exact commands, lives in the project's `docs/self-hosting.md` on GitHub.",
      },
    ],
  },
];
