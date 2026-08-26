/**
 * Whether this device's file picker actually honors a file input's `capture` attribute (opens a
 * camera directly) rather than silently ignoring it and falling back to a plain file browser —
 * true on touch-primary devices (phones/tablets), false on desktop/laptop regardless of an
 * attached webcam, since desktop file pickers never implement `capture` (issue #251). `pointer:
 * coarse` is the standard signal for "primary input is a touchscreen," which lines up with which
 * devices' OS file pickers offer a camera shortcut.
 */
export function isCameraCapableDevice(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(pointer: coarse)").matches;
}
