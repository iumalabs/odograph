import { t } from "../i18n/strings";

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
};

// The approved gauge-mark logo — matches public/favicon.svg exactly (docs/odograph-design.zip
// "Иконки и лого", variant A · Прибор, the one marked as selected in the source).
export function Logo({ size = 34, withWordmark = false }: LogoProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.4 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ flex: "none" }}>
        <rect width="32" height="32" rx="9" fill="var(--acc)" />
        <path
          d="M8 21a8 8 0 0 1 16 0"
          fill="none"
          stroke="var(--on-acc)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M16 19.5l5.2-5.8"
          fill="none"
          stroke="var(--on-acc)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="16" cy="20" r="1.7" fill="var(--on-acc)" />
      </svg>
      {withWordmark && (
        <span style={{ font: "800 24px var(--font-ui)", letterSpacing: "-.03em" }}>
          {t("appTitle")}
        </span>
      )}
    </div>
  );
}
