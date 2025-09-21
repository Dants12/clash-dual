import type { ReactNode } from 'react';

export type BadgeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

export function Badge({ tone = 'info', children, className, icon }: BadgeProps) {
  const badgeClass = ['badge', `badge--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={badgeClass}>
      {icon && <span className="badge-icon">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

export default Badge;
