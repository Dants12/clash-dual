import type { ReactNode } from 'react';
import React from 'react';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}
type Props = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  bodyClassName?: string;
};

export function Card({ title, subtitle, children, bodyClassName }: Props) {
  return (
    <section className="card">
      {(title || subtitle) && (
        <header className="card__header">
          {title && <h3 className="card__title">{title}</h3>}
          {subtitle && <p className="card__subtitle">{subtitle}</p>}
        </header>
      )}
      <div className={`card__body ${bodyClassName || ''}`}>{children}</div>
    </section>
  );
}

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
