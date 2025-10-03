import type { ReactNode, HTMLAttributes } from 'react';
import styled, { css } from 'styled-components';

export type BadgeTone = 'primary' | 'secondary' | 'muted' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const toneStyles = {
  primary: css`
    background: var(--badge-primary-bg);
    border-color: var(--badge-primary-border);
    color: var(--badge-primary-text);
  `,
  secondary: css`
    background: var(--badge-secondary-bg);
    border-color: var(--badge-secondary-border);
    color: var(--badge-secondary-text);
  `,
  muted: css`
    background: var(--badge-muted-bg);
    border-color: var(--badge-muted-border);
    color: var(--badge-muted-text);
  `,
  info: css`
    background: var(--badge-info-bg);
    border-color: var(--badge-info-border);
    color: var(--badge-info-text);
  `,
  success: css`
    background: var(--badge-success-bg);
    border-color: var(--badge-success-border);
    color: var(--badge-success-text);
  `,
  warning: css`
    background: var(--badge-warning-bg);
    border-color: var(--badge-warning-border);
    color: var(--badge-warning-text);
  `,
  danger: css`
    background: var(--badge-danger-bg);
    border-color: var(--badge-danger-border);
    color: var(--badge-danger-text);
  `,
} as const satisfies Record<Exclude<BadgeTone, 'neutral'>, ReturnType<typeof css>>;

const BadgeRoot = styled.span<{ $tone: Exclude<BadgeTone, 'neutral'> }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid transparent;
  background: var(--badge-default-bg);
  color: var(--color-body);
  box-shadow: var(--shadow-badge);

  ${({ $tone }) => toneStyles[$tone]}
`;

const BadgeIcon = styled.span`
  display: inline-flex;
  align-items: center;
`;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
  icon?: ReactNode;
}

export function Badge({ tone = 'info', children, icon, ...rest }: BadgeProps) {
  const resolvedTone: Exclude<BadgeTone, 'neutral'> = tone === 'neutral' ? 'muted' : tone;

  return (
    <BadgeRoot $tone={resolvedTone} {...rest}>
      {icon && <BadgeIcon aria-hidden="true">{icon}</BadgeIcon>}
      <span>{children}</span>
    </BadgeRoot>
  );
}

export default Badge;
