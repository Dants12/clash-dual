import type { ReactNode } from 'react';
import styled from 'styled-components';
import { CardBody, CardSection, CardTitle } from './Card';

const PanelContainer = styled(CardSection)`
  gap: var(--gap-sm);
`;

const PanelHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--gap-sm);
`;

const PanelTitle = styled(CardTitle).attrs({ as: 'h2' })`
  margin: 0;
`;

const PanelDivider = styled.div`
  height: 1px;
  background: var(--color-border);
  opacity: 0.25;
  border-radius: 999px;
`;

const PanelContent = styled(CardBody)`
  padding: 0;
`;

interface PanelProps {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function Panel({ title, children, actions, className }: PanelProps) {
  return (
    <PanelContainer className={className}>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
        {actions}
      </PanelHeader>
      <PanelDivider aria-hidden="true" />
      <PanelContent>{children}</PanelContent>
    </PanelContainer>
  );
}
