# Feature Specification: Web Push Reminder Delivery

**Feature Branch**: `022-web-push-reminders`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Web push reminder delivery (issue #15, milestone M5, constitution
D-002 locked decision: reminder channels are email and web push, no generic webhook in v1). Adds
web push as a second delivery channel for the same due-reminder notifications email already sends
(spec 012) — same trigger, same escalation/dedup rule, an additional channel, not a replacement."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Get notified without having the app open (Priority: P1)

An owner turns on push notifications for reminders once, from within the app. From then on, when
one of their reminders becomes due (coming up or overdue), they get a notification on that device
even if they haven't opened Odograph in days — the same way they'd already get an email today, but
delivered as a browser/OS notification instead.

**Why this priority**: This is the entire point of the feature — issue #15 exists because email
alone isn't the notification style everyone wants, and this is the second of the two channels the
project already committed to shipping for v1 (D-002).

**Independent Test**: Opt in to push notifications, grant the browser's permission prompt, then
(with a reminder that's due) trigger the same daily check that already sends email and confirm a
push notification arrives without the app being open, and that selecting it opens the app.

**Acceptance Scenarios**:

1. **Given** a signed-in owner, **When** they opt in to push notifications, **Then** the browser
   prompts for notification permission, and once granted, their device is registered to receive
   them.
2. **Given** an opted-in device and a reminder that has just become "coming up" or "overdue" for
   the first time at that severity, **When** the next scheduled reminder check runs, **Then** a
   push notification is delivered to that device without the app needing to be open.
3. **Given** a reminder that already triggered a notification at its current severity, **When** the
   next scheduled check runs and nothing has changed, **Then** no duplicate notification is sent —
   the same anti-repeat guarantee email reminders already have.
4. **Given** a delivered push notification, **When** the owner selects it, **Then** it brings them
   into the app.

---

### User Story 2 - Turn it back off (Priority: P2)

An owner who opted in decides they'd rather not get push notifications on this device anymore and
turns it off from the same place they turned it on.

**Why this priority**: An opt-in with no opt-out isn't a real opt-in — this is the minimum needed to
make User Story 1 trustworthy rather than a one-way commitment.

**Independent Test**: With push notifications enabled, turn them off, then trigger the same due-
reminder check used in User Story 1 and confirm no notification arrives on that device.

**Acceptance Scenarios**:

1. **Given** push notifications are enabled on a device, **When** the owner turns them off, **Then**
   that device stops receiving them from that point on.
2. **Given** push notifications were turned off, **When** a reminder becomes due afterward, **Then**
   the owner still gets the email notification (if otherwise eligible) — turning off push does not
   turn off email.

---

### User Story 3 - Enabled on more than one device (Priority: P3)

An owner uses Odograph from both their phone and their laptop and opts in to push notifications on
each. When a reminder becomes due, both devices get notified — not just whichever one they signed up
on most recently.

**Why this priority**: A real usage pattern (checking the app from more than one device) that the
simplest possible implementation (one subscription per account) would silently break, quietly
degrading to "only my most recently enabled device gets notified" — a nice-to-have consistency
guarantee, not core to the feature's basic value.

**Independent Test**: Opt in to push notifications from two different browsers/devices for the same
account, trigger a due-reminder check, and confirm both receive the notification.

**Acceptance Scenarios**:

1. **Given** push notifications are enabled on two different devices for the same account, **When**
   a reminder becomes due, **Then** both devices receive the notification.
2. **Given** push notifications are then turned off on one of those devices, **When** another
   reminder becomes due, **Then** the other device still receives it — turning off one device's
   notifications doesn't affect any other device.

---

### Edge Cases

- What happens if the owner denies the browser's notification permission prompt? The app tells them
  push notifications aren't available rather than silently acting as if they'd opted in.
- What happens if a device's registration becomes invalid later (e.g. the browser or OS revokes it,
  or the user clears site data)? Delivery to that device is simply skipped going forward — this is
  not treated as a failed reminder notification, the same way a bounced/undeliverable email today
  doesn't block re-attempting later.
- What happens if a reminder's severity increases again after already notifying once (e.g.
  "coming up" escalates to "overdue")? A new notification is sent for the new severity — this
  mirrors the existing email escalation behavior exactly, not a new rule.
- What happens if the owner has never opted in on any device? They simply don't receive push
  notifications — email (if otherwise eligible) continues unaffected, exactly as it works today
  before this feature exists.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Users MUST be able to opt in to push notifications for their reminders from within the
  app.
- **FR-002**: Opting in MUST request the browser's notification permission and, once granted,
  register the device to receive reminder notifications.
- **FR-003**: If notification permission is denied or unavailable, the app MUST clearly indicate
  that push notifications aren't available on that device, rather than behaving as if the user had
  opted in.
- **FR-004**: An opted-in device MUST receive a notification the first time a reminder reaches
  "coming up" or "overdue" severity, using the same escalation-based anti-repeat rule that already
  governs email reminder delivery — no duplicate notification for a reminder that stays at the same
  severity.
- **FR-005**: A user with more than one opted-in device MUST have every one of them notified, not
  only the most recently opted-in one.
- **FR-006**: Users MUST be able to turn push notifications off for a device they previously opted
  in on.
- **FR-007**: Turning push notifications on or off MUST NOT affect whether the user continues to
  receive email reminders — the two channels are independent and additive.
- **FR-008**: A device whose registration has become invalid MUST be skipped for future delivery
  without that being treated as a failed reminder notification.
- **FR-009**: Selecting a delivered push notification MUST bring the user into the app.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An opted-in user with a currently-due reminder receives a push notification, without
  the app being open, by the next scheduled reminder check.
- **SC-002**: 100% of a user's currently opted-in devices receive a given due-reminder notification
  together, not just one of them.
- **SC-003**: Turning off push notifications on a device stops future deliveries to that specific
  device within one action, with no further notifications arriving on it afterward.
- **SC-004**: No reminder ever produces more than one push notification per device for the same
  severity level — matching the zero-duplicate guarantee email reminders already have today.

## Assumptions

- **Mirrors email's exact trigger and escalation/dedup rule** (spec 012) — the same scheduled
  reminder check that already decides *when* an email fires also decides *when* a push notification
  fires, for the same severity crossing. This feature adds a second delivery channel to an existing
  decision, not a new schedule or a new escalation rule.
- **Push works independently of whether the app is installed as a PWA** — it only requires
  notification permission and an active service worker registration (already established by the PWA
  installability work, issue #18), not a home-screen install.
- **"Device" means "browser/service-worker registration."** There is no v1 UI to view or manage a
  named list of a user's devices — opting in on a new browser adds another independent
  registration, and opting out only affects the device you're currently using.
- **Notification content mirrors the email's substance** (vehicle name, reminder label, due status)
  — this feature does not introduce new content beyond what's already decided for the email channel.
