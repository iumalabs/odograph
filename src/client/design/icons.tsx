// Icon path data ported verbatim from docs/odograph-design.zip's "Иконки и лого" mockup — only
// the icons this feature's in-scope screens actually use (spec.md Assumptions). Icon rules from
// the mockup (06 · ПРАВИЛА): currentColor only, no fills/gradients inside an icon, single stroke
// width per icon, no emoji.

type IconProps = {
  size?: number;
};

const commonProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function GarageIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M8.5 20v-4.5h7V20" />
      <path d="M8.5 17.5h7" />
    </svg>
  );
}

export function DashboardIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M4 20h16" />
      <path d="M7.5 20v-5" />
      <path d="M12 20V8" />
      <path d="M16.5 20v-8" />
    </svg>
  );
}

export function ServiceIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M12 3.5l7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

export function FuelIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M6 20V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14" />
      <path d="M4 20h12" />
      <path d="M14 9.5h2.5a2 2 0 0 1 2 2v4.5a1.75 1.75 0 0 0 3.5 0V8.5L20 6.5" />
    </svg>
  );
}

export function CarIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M3.5 15l1.9-5.3A2.2 2.2 0 0 1 7.5 8.2h9a2.2 2.2 0 0 1 2.1 1.5L20.5 15" />
      <path d="M3 15h18v3.2h-2" />
      <path d="M5 18.2H3V15" />
      <circle cx="7.5" cy="18.2" r="1.7" />
      <circle cx="16.5" cy="18.2" r="1.7" />
    </svg>
  );
}

export function AddIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function UploadIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M12 4.5v9" />
      <path d="M8.5 8L12 4.5 15.5 8" />
      <path d="M4.5 14v4a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4" />
    </svg>
  );
}

export function ReceiptIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M6.5 3h11v18l-2.75-1.8L12 21l-2.75-1.8L6.5 21z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </svg>
  );
}

// Not in the mockup's icon sheet — hand-rolled to the same spec, per the design's own rule for
// entities not in the set: "take the closest matching geometry, never an illustration."
export function CloseIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// Not in the mockup's icon sheet — hand-rolled to the same spec (see CloseIcon).
export function BellIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.75 2.5H4.25z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

// Not in the mockup's icon sheet — hand-rolled to the same spec (see CloseIcon).
export function CameraIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

// Not in the mockup's icon sheet — hand-rolled to the same spec (see CloseIcon).
export function AlertIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...commonProps}>
      <path d="M12 3.5 21.5 20h-19z" />
      <path d="M12 9.5v5" />
      <circle cx="12" cy="17.25" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}
