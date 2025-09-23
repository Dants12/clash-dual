import type { ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Card({ title, subtitle, actions, children, className, bodyClassName }: CardProps) {
  const hasHeader = Boolean(title || subtitle || actions);
  const wrapperClassName = ['card', className].filter(Boolean).join(' ');
  const bodyClass = ['card-body', bodyClassName].filter(Boolean).join(' ');

  return (
    <section className={wrapperClassName}>
      {hasHeader && (
        <div className="card-header">
          <div className="card-heading">
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export default Card;
