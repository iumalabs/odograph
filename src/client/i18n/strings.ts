// Minimal i18n infrastructure (constitution Principle IX): no user-facing
// string is written inline at its usage site, even though only `en` ships
// in v1. A single locale table + key lookup now is deliberately small — the
// real UI (once the Claude-design mockups land) can swap this for a proper
// library without changing how call sites reference strings, since they
// already go through `t()` and a key, not a literal.

const en = {
  appTitle: "Odograph",
  appTagline: "Vehicle maintenance tracker",
  emailLabel: "Email",
  signUpWithPasskey: "Sign up with passkey",
  signInWithPasskey: "Sign in with passkey",
  addAnotherPasskey: "Add another passkey",
  signedInAs: "Signed in — tenant {tenantId}",
  sendMagicLink: "Email me a sign-in link",
  magicLinkSentBanner: "Check your email for a sign-in link.",
  magicLinkOkBanner: "Signed in via email link.",
  magicLinkErrorBanner: "That sign-in link is invalid or has expired.",
  continueWithGoogle: "Continue with Google",
  oidcOkBanner: "Signed in with Google.",
  oidcErrorBanner: "Google sign-in didn't complete. Please try again.",
  linkEmailLabel: "Email to link",
  linkEmail: "Link email",
  linkEmailSentBanner: "Check your email to confirm the link.",
  magicLinkLinkedBanner: "Email linked to your account.",
  linkGoogleAccount: "Link Google account",
  oidcLinkedBanner: "Google account linked.",
  vehiclesHeading: "Your vehicles",
  vehicleNameLabel: "Name",
  vehicleOdometerUnitLabel: "Odometer unit",
  addVehicle: "Add vehicle",
  noVehiclesYet: "No vehicles yet.",
  serviceRecordsHeading: "Service history",
  noServiceRecordsYet: "No service records yet.",
  serviceDateLabel: "Date",
  serviceDescriptionLabel: "Description",
  addServiceRecord: "Add service record",
  attachmentUploadLabel: "Attach a photo or receipt",
  uploadAttachment: "Upload",
  attachmentsLabel: "Attachments",
  closeVehicle: "Close",
  fuelRecordsHeading: "Fuel history",
  noFuelRecordsYet: "No fuel records yet.",
  fuelDateLabel: "Date",
  fuelOdometerLabel: "Odometer",
  fuelVolumeLabel: "Volume",
  fuelCostLabel: "Cost",
  fuelStationLabel: "Station",
  addFuelRecord: "Add fuel record",
  fuelEconomyNotEnoughData: "—",
  possibleDuplicateLabel: "Possible duplicate",
  dismissDuplicate: "Dismiss",
  reminderRulesHeading: "Reminders",
  noReminderRulesYet: "No reminders yet.",
  reminderLabelLabel: "Reminder",
  reminderIntervalDaysLabel: "Every (days)",
  reminderIntervalDistanceLabel: "Every (distance)",
  reminderLastDoneDateLabel: "Last done (date)",
  reminderLastDoneOdometerLabel: "Last done (odometer)",
  addReminderRule: "Add reminder",
  markReminderDone: "Mark done",
  deleteReminderRule: "Delete",
  reminderStatusOnTrack: "On track",
  reminderStatusComingUp: "Coming up",
  reminderStatusOverdue: "Overdue",
  reminderStatusNotEnoughData: "Not enough data",
  genericError: "Something went wrong. Please try again.",
} as const;

export type StringKey = keyof typeof en;

const locales = { en } as const;
const activeLocale: keyof typeof locales = "en";

export function t(key: StringKey, params?: Record<string, string>): string {
  let value: string = locales[activeLocale][key];
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replace(`{${name}}`, replacement);
    }
  }
  return value;
}
