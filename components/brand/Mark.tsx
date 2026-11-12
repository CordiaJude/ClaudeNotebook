import { BRAND } from "@/lib/brand";

/** Our own mark: notebook page with folded corner and two ink lines. Not an asterisk. */
export function Mark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M6 3h8.5L19 7.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14.5 3v3.5a1 1 0 0 0 1 1H19" />
      <path d="M8 12.5h8M8 16.5h5" />
    </svg>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="cn-wordmark" style={{ fontSize: size }}>
      <Mark size={Math.round(size * 1.2)} />
      <span>{BRAND.name}</span>
    </span>
  );
}
