import type { ReactNode } from 'react';
import styled from 'styled-components';

export const CardSection = styled.section`
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 24px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
`;

export const CardHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--gap-md);
  margin-bottom: 4px;
`;

export const CardHeading = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const CardTitle = styled.div`
  font-size: 17px;
  font-weight: 600;
  color: var(--color-heading);
`;

export const CardSubtitle = styled.div`
  font-size: 13px;
  color: var(--color-muted);
`;

export const CardActions = styled.div`
  display: flex;
  gap: var(--gap-sm);
  align-items: center;
`;

export const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
`;

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, actions, children, className }: CardProps) {
  const hasHeader = Boolean(title || subtitle || actions);

  return (
    <CardSection className={className}>
      {hasHeader && (
        <CardHeader>
          <CardHeading>
            {title && <CardTitle>{title}</CardTitle>}
            {subtitle && <CardSubtitle>{subtitle}</CardSubtitle>}
          </CardHeading>
          {actions && <CardActions>{actions}</CardActions>}
        </CardHeader>
      )}
      {children}
    </CardSection>
  );
}

export default Card;
