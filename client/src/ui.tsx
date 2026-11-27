import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "plus"
  | "users"
  | "user"
  | "bolt"
  | "fire"
  | "clock"
  | "check"
  | "chevron"
  | "search"
  | "trophy"
  | "bell"
  | "dumbbell"
  | "calendar"
  | "settings"
  | "pin"
  | "arrow"
  | "lock"
  | "logout"
  | "share"
  | "link"
  | "shield"
  | "x"
  | "edit";

const iconPaths: Record<IconName, ReactNode> = {
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5M9 21v-7h6v7" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  bolt: <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z" />,
  fire: <path d="M12 22c4.4 0 7-3.2 7-7.3 0-3.2-1.8-6.3-5.2-9.4.2 3.2-1.7 5-3.2 5.8.1-3-1.3-5.2-3.1-6.6.1 3.7-2.5 5.6-2.5 9.9C5 18.6 7.8 22 12 22Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM10 13v4M14 13v4M7 21h10M9 17h6" /><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></>,
  dumbbell: <><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  pin: <><path d="m14 4 6 6-3 1-4 4-1 5-2-2-4 4-2-2 4-4-2-2 5-1 4-4 1-3Z" /></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" /></>,
};

export function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}


export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}


export function Button({ children, className = "", onClick, disabled = false, label, type = "button" }: { children: ReactNode; className?: string; onClick?: () => void; disabled?: boolean; label?: string; type?: "button" | "submit" }) {
  return <button type={type} aria-label={label} disabled={disabled} onClick={onClick} className={className}>{children}</button>;
}


export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}


export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}


export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <div>
      <div className="page-title">{children}</div>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
  );
}


export function StatCard({ icon, label, value, detail, color }: { icon: IconName; label: string; value: string; detail: string; color: string }) {
  return (
    <Card className="stat-card">
      <div className={`stat-icon ${color}`}><Icon name={icon} /></div>
      <div>
        <Label>{label}</Label>
        <div className="stat-value">{value}</div>
        <div className="stat-detail">{detail}</div>
      </div>
    </Card>
  );
}
