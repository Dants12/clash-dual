import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { css } from 'styled-components';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CrashDualCanvas from './games/CrashDualCanvas';
import DuelABPanel from './games/DuelABPanel';
import { createWS, persistUid } from './ws';
import type { GameMode, RoundStats, Side, Snapshot } from './types';
import { Card, CardBody } from './ui/Card';
import { Badge, type BadgeTone } from './ui/Badge';
import { MetricRow, MetricValue, MutedText } from './ui/MetricRow';

interface EventEntry {
  id: string;
  text: string;
  ts: number;
}

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatCents = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value / 100 : 0);
const formatSeconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
const formatMultiplier = (value: number) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}x`;
const formatMultiplierDelta = (value: number) => `${value >= 0 ? '+' : ''}${(Number.isFinite(value) ? value : 0).toFixed(2)}x`;
const formatPercent = (value: number) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;
const shortId = (value?: string) => (value ? value.slice(0, 8).toUpperCase() : '—');
const formatMode = (mode: GameMode) => (mode === 'crash_dual' ? 'Crash Dual' : 'A/B Duel');
const eventId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const phaseToneMap: Record<string, BadgeTone> = {
  betting: 'primary',
  running: 'success',
  resolve: 'warning',
  crash: 'danger',
  intermission: 'muted'
};

const QUICK_TOPUPS = [500, 1_000, 2_500, 5_000, 10_000, 25_000];
const BET_PRESETS = [500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000];

const ArenaCardBody = styled(CardBody)`
  gap: var(--gap-lg);
`;

const AppShell = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(14px);
`;

const Header = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 420px) minmax(0, 340px) minmax(0, 260px);
  gap: clamp(18px, 3vw, 32px);
  padding: clamp(28px, 5vw, 48px);
  background: var(--color-header);
  border-bottom: 1px solid var(--color-header-border);
  box-shadow: var(--shadow-header);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(18px);

  @media (max-width: 1400px) {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.9fr);
    padding-inline: clamp(32px, 6vw, 48px);
  }

  @media (max-width: 1180px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: clamp(16px, 3vw, 24px);
  }

  @media (max-width: 1040px) {
    grid-template-columns: minmax(0, 1fr);
    position: static;
    padding-inline: clamp(22px, 6vw, 36px);
    row-gap: clamp(16px, 3vw, 24px);
  }

  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr);
    padding-inline: 18px;
  }
`;

const headerPanelStyles = css`
  position: relative;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  padding: clamp(20px, 2.3vw, 28px);

  @media (max-width: 640px) {
    padding: 20px;
  }
`;

const HeaderTitle = styled.div`
  ${headerPanelStyles};
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: var(--gap-md);
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 85% 20%, var(--color-secondary-soft), transparent 55%);
    pointer-events: none;
    mix-blend-mode: screen;
  }

  h1 {
    margin: 0;
    font-size: clamp(26px, 3.6vw, 34px);
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--color-heading);

    @media (max-width: 640px) {
      font-size: 22px;
    }
  }
`;

const HeaderLogo = styled.div`
  width: clamp(58px, 6vw, 72px);
  height: clamp(58px, 6vw, 72px);
  border-radius: 22px;
  background: var(--color-logo);
  display: grid;
  place-items: center;
  font-size: clamp(24px, 3vw, 30px);
  color: var(--color-logo-ink);
  box-shadow: var(--shadow-logo);

  @media (max-width: 640px) {
    width: 56px;
    height: 56px;
  }
`;

const HeaderCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HeaderEyebrow = styled.span`
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-secondary);
`;

const HeaderLead = styled.p`
  margin: 0;
  font-size: clamp(14px, 1.6vw, 16px);
  line-height: 1.6;
  color: var(--color-muted);
  max-width: 42ch;

  @media (max-width: 640px) {
    font-size: 13px;
  }
`;

const HeaderBadges = styled.div`
  ${headerPanelStyles};
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
`;

const HeaderBadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);
`;

const HeaderHint = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-muted);
`;

const HeaderControls = styled.div`
  ${headerPanelStyles};
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
  align-items: stretch;

  @media (max-width: 1180px) {
    grid-column: span 2;
  }
`;

const HeaderControlsGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
`;

const HeaderControlsLabel = styled.span`
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-secondary);
`;

const HeaderControlsHint = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-faint);
`;

const Segmented = styled.div`
  display: inline-flex;
  padding: 6px;
  border-radius: var(--radius-md);
  background: var(--color-surface-strong);
  border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-segmented);
  gap: 6px;
`;

const HeaderSegmented = styled(Segmented)`
  width: 100%;
  justify-content: space-between;

  @media (max-width: 1180px) {
    justify-content: flex-start;
  }
`;

const SegmentedButton = styled.button<{ $active?: boolean }>`
  border-radius: calc(var(--radius-md) - 4px);
  background: ${({ $active }) => ($active ? 'var(--segmented-active-bg)' : 'transparent')};
  border: 0;
  padding: 10px 16px;
  color: ${({ $active }) => ($active ? 'var(--segmented-active-color)' : 'var(--color-muted)')};
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  ${({ $active }) =>
    $active &&
    css`
      box-shadow: var(--segmented-active-shadow);
    `}

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const Main = styled.main`
  --layout-max-width: 1640px;
  --layout-gutter: clamp(28px, 5vw, 48px);
  --layout-column-gap: clamp(24px, 4vw, 36px);
  flex: 1;
  width: min(100%, var(--layout-max-width));
  padding: clamp(40px, 6vw, 80px) 0 clamp(64px, 8vw, 108px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(32px, 5vw, 48px);

  @media (max-width: 640px) {
    padding-block: 28px 40px;
  }
`;

const IntroSection = styled.section`
  width: min(100%, var(--layout-max-width));
  margin: 0 auto;
  padding: clamp(24px, 3vw, 36px);
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.45fr);
  gap: clamp(18px, 3vw, 32px);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);

  @media (max-width: 1400px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  @media (max-width: 1040px) {
    margin-inline: clamp(22px, 7vw, 36px);
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 780px) {
    margin-inline: clamp(18px, 8vw, 28px);
  }

  @media (max-width: 640px) {
    padding: 20px;
    gap: var(--gap-md);
  }
`;

const IntroCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;

  h2 {
    margin: 0;
    font-size: clamp(22px, 3vw, 28px);
    font-weight: 700;
    color: var(--color-heading);
    letter-spacing: 0.02em;
  }

  p {
    margin: 0;
    font-size: clamp(14px, 1.4vw, 16px);
    line-height: 1.6;
    color: var(--color-muted);
  }
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: clamp(12px, 2.5vw, 18px);

  @media (max-width: 640px) {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
`;

const SummaryItem = styled.div`
  background: var(--color-surface-strong);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-summary-border);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: var(--shadow-summary);
`;

const SummaryLabel = styled.span`
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-faint);
`;

const SummaryValue = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: var(--color-heading);
`;

const Layout = styled.div`
  width: min(100%, var(--layout-max-width));
  margin: 0 auto;
  padding: 0 var(--layout-gutter) 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-lg);
`;

const Column = styled.div<{ $isDropping?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--gap-lg);
  min-width: 0;
  position: relative;
  width: 100%;
  max-width: 700px;
  margin: 0 auto;
`;

const ColumnPlaceholder = styled.div`
  pointer-events: none;
  min-height: 1px;
`;

const draggablePanelStyles = css`
  cursor: grab;
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  will-change: transform;
  width: 100%;
  max-width: 700px;

  &:focus-visible {
    outline: 2px solid var(--color-secondary);
    outline-offset: 6px;
  }
`;

const DraggablePanel = styled.div<{ $isDragging?: boolean; $isSorting?: boolean }>`
  ${draggablePanelStyles};
  ${({ $isDragging }) =>
    $isDragging &&
    css`
      cursor: grabbing;
      opacity: 0.9;
      box-shadow: var(--shadow-strong);
      z-index: 5;
    `}
`;

const buttonBaseStyles = css`
  appearance: none;
  border: 0;
  border-radius: var(--radius-sm);
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.2s ease, box-shadow 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--button-text);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  &:disabled {
    cursor: not-allowed;
    filter: saturate(0.75) brightness(0.85);
    opacity: 0.7;
  }
`;

const Button = styled.button<{
  $variant?: 'primary' | 'secondary' | 'muted';
  $compact?: boolean;
  $active?: boolean;
}>`
  ${buttonBaseStyles};
  ${({ $variant = 'muted' }) => {
    switch ($variant) {
      case 'primary':
        return css`
          background: var(--button-primary-bg);
          box-shadow: var(--button-primary-shadow);
        `;
      case 'secondary':
        return css`
          background: var(--button-secondary-bg);
          box-shadow: var(--button-secondary-shadow);
        `;
      default:
        return css`
          background: var(--button-muted-bg);
          color: var(--button-muted-text);
          box-shadow: var(--button-muted-shadow);
        `;
    }
  }};

  ${({ $compact }) =>
    $compact &&
    css`
      padding: 6px 12px;
      font-size: 12px;
      letter-spacing: 0.05em;
    `}

  ${({ $active }) =>
    $active &&
    css`
      background: var(--segmented-active-bg);
      color: var(--segmented-active-color);
      box-shadow: var(--segmented-active-shadow);
    `}
`;

const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ControlLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-secondary);
`;

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);
`;

const WalletBalance = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const WalletBalanceLabel = styled.span`
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-secondary);
`;

const WalletBalanceValue = styled.div`
  font-size: clamp(28px, 3.5vw, 38px);
  font-weight: 700;
  color: var(--color-heading);
  text-shadow: var(--shadow-balance);
`;

const WalletBalanceTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);
`;

const WalletTopups = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);

  ${Button} {
    flex: 1 0 100px;
    min-width: 96px;
  }
`;

const WalletTopupsHint = styled(MutedText)`
  font-size: 12px;
`;

const WalletTargets = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  background: var(--color-panel);
  border: 1px solid var(--color-panel-border);
  border-radius: var(--radius-md);
  padding: 16px;
  box-shadow: var(--shadow-panel);
`;

const WalletTargetsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-secondary);
`;

const WalletTargetsInputs = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--gap-sm);
`;

const WalletTargetsInput = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-muted);
  }
`;

const WalletTargetsFoot = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-muted);
`;

const WalletTargetsRound = styled.span`
  font-weight: 600;
  color: var(--color-heading);
`;

const WalletTargetsDelta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;

  strong {
    font-weight: 600;
    color: var(--color-heading);
  }
`;

const WalletTargetsDivider = styled.span`
  color: var(--color-faint);
`;

const WalletMetrics = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--gap-sm);
`;

const WalletMetricRow = styled(MetricRow)`
  background: var(--color-panel-alt);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  border: 1px solid var(--color-panel-border-strong);

  ${MetricValue} {
    text-align: left;
  }
`;

const BetStepper = styled.div`
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
  justify-content: space-between;
`;

const BetStepperValue = styled.span`
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-heading);
`;

const BetPresets = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);

  ${Button} {
    flex: 1 0 100px;
    min-width: 96px;
  }
`;

const BetSlider = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const BetSliderScale = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-muted);
`;

const BetSideOverview = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);
  justify-content: space-between;
  align-items: center;
`;

const BetSideChip = styled.div<{ $side: Side }>`
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1px solid ${({ $side }) => ($side === 'A' ? 'var(--color-side-a-border)' : 'var(--color-side-b-border)')};
  background: var(--color-panel);
  box-shadow: var(--shadow-panel-strong);
  min-width: 160px;
`;

const BetSideChipLabel = styled.span`
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-muted);
`;

const BetSideChipValue = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: var(--color-heading);
`;

const BetSideChipPlan = styled.span`
  font-size: 12px;
  color: var(--color-secondary);
`;

const BetSideActions = styled.div`
  display: flex;
  gap: var(--gap-sm);
  align-items: center;
`;

const MicroGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gap-md);

  @media (max-width: 1040px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const MicroSide = styled.div`
  background: var(--color-panel);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-panel-border);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
  box-shadow: var(--shadow-panel-strong);
`;

const MicroSideHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const MicroStat = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
`;

const MicroControls = styled.div`
  display: flex;
  gap: var(--gap-sm);
`;

const ArenaGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr);
  gap: var(--gap-lg);

  @media (max-width: 1040px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ArenaStage = styled.div`
  background: var(--color-surface-strong);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 360px;
  box-shadow: var(--shadow-strong);
  padding: 20px;

  canvas {
    width: 900px;
    height: 460px;
    border-radius: calc(var(--radius-lg) - 6px);
    border: 1px solid var(--color-canvas-border);
    background: var(--color-canvas);
  }
`;

const ArenaEmpty = styled.div`
  color: var(--color-muted);
  font-size: 14px;
`;

const ArenaSidebar = styled.aside`
  background: var(--color-surface-strong);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-soft);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
`;

const ArenaSidebarTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-secondary);
`;

const ArenaParameters = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
`;

const EventList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  max-height: 280px;
  overflow-y: auto;
`;

const EventItem = styled.li`
  background: var(--color-event);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-event-border);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const EventTime = styled.span`
  font-size: 11px;
  color: var(--color-faint);
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const EventText = styled.span`
  font-size: 13px;
  color: var(--color-heading);
`;

const AppFooter = styled.footer`
  padding: clamp(20px, 4vw, 32px) clamp(28px, 6vw, 64px) clamp(32px, 6vw, 48px);
  background: var(--color-footer);
  border-top: 1px solid var(--color-footer-border);
  box-shadow: var(--shadow-footer);
`;

const AppFooterInner = styled.div`
  max-width: min(1680px, 50%);
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: clamp(10px, 2.5vw, 18px);
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--color-muted);

  @media (max-width: 1040px) {
    justify-content: center;
    text-align: center;
  }

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    text-align: left;
  }
`;

const AppFooterBrand = styled.span`
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-heading);
`;

const AppFooterNote = styled.span`
  flex: 1 1 240px;
  font-size: 13px;
  letter-spacing: normal;
  text-transform: none;
  color: var(--color-muted);

  @media (max-width: 640px) {
    font-size: 12px;
  }
`;

const BuildIndicator = styled.div`
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--color-surface-strong);
  border: 1px solid var(--color-border-strong);
  box-shadow: 0 18px 40px rgba(6, 10, 26, 0.35);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-muted);
`;

const BuildIndicatorCommit = styled.span`
  color: var(--color-secondary);
  font-weight: 600;
`;

const generateBetId = () => {
  const globalCrypto = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (globalCrypto?.randomUUID) {
    try {
      return globalCrypto.randomUUID();
    } catch {}
  }
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2);
  return `bet-${timestamp}-${random}`;
};

const COLUMN_KEYS = ['main'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
type PanelId = 'wallet' | 'bet' | 'micro' | 'arena' | 'investor' | 'stats' | 'totals' | 'events';

type Layout = Record<ColumnKey, PanelId[]>;

const PANEL_IDS: readonly PanelId[] = ['wallet', 'bet', 'micro', 'arena', 'investor', 'stats', 'totals', 'events'];

const initialLayout: Layout = {
  main: ['wallet', 'bet', 'micro', 'arena', 'investor', 'stats', 'totals', 'events']
};

const LAYOUT_STORAGE_KEY = 'clash-dual:layout:v1';

const cloneLayout = (value: Layout): Layout => ({
  main: [...value.main]
});

const normalizeLayout = (candidate?: Partial<Record<ColumnKey, PanelId[]>>): Layout => {
  const seen = new Set<PanelId>();
  const next: Layout = { main: [] };

  for (const column of COLUMN_KEYS) {
    const panels = Array.isArray(candidate?.[column]) ? candidate?.[column] ?? [] : [];
    for (const panel of panels) {
      if ((PANEL_IDS as readonly string[]).includes(panel) && !seen.has(panel as PanelId)) {
        const id = panel as PanelId;
        next[column].push(id);
        seen.add(id);
      }
    }
  }

  for (const panel of PANEL_IDS) {
    if (!seen.has(panel)) {
      const fallbackColumn =
        COLUMN_KEYS.find((column) => initialLayout[column].includes(panel)) ?? COLUMN_KEYS[0];
      next[fallbackColumn].push(panel);
      seen.add(panel);
    }
  }

  return next;
};

const loadLayout = (): Layout | null => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, PanelId[]>>;
    return normalizeLayout(parsed);
  } catch {
    return null;
  }
};

const saveLayout = (value: Layout) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(value));
  } catch {}
};

function SortablePanel({ id, children }: { id: PanelId; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'manipulation'
  };

  return (
    <DraggablePanel
      ref={setNodeRef}
      style={style}
      $isDragging={isDragging}
      $isSorting={isSorting}
      {...attributes}
      {...listeners}
    >
      {children}
    </DraggablePanel>
  );
}

export default function App() {
  const [ws, setWS] = useState<WebSocket | null>(null);
  const [layout, setLayout] = useState<Layout>(() => loadLayout() ?? cloneLayout(initialLayout));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const uid = useRef<string>('');
  const [wallet, setWallet] = useState(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [amount, setAmount] = useState(5_000);
  const [side, setSide] = useState<Side>('A');
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [microStep, setMicroStep] = useState(1);
  const [targetInputs, setTargetInputs] = useState<Record<Side, string>>({ A: '', B: '' });
  const [targetRoundId, setTargetRoundId] = useState<string | null>(null);
  const commit = (import.meta.env.VITE_COMMIT as string | undefined) || 'local';
  const lastBet = useRef<{
    amount: number;
    side: Side;
    mode: GameMode;
    roundId: string | null;
    betId: string;
  } | null>(null);

  const pushEvent = useCallback((text: string) => {
    setEvents((prev) => [{ id: eventId(), text, ts: Date.now() }, ...prev].slice(0, 30));
  }, []);

  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  const handleSnapshot = useCallback((incoming: Snapshot) => {
    setSnap((prev) => {
      if (prev) {
        if (prev.mode !== incoming.mode) {
          pushEvent(`Mode switched to ${formatMode(incoming.mode)}`);
        }

        if (incoming.mode === 'crash_dual' && incoming.crash) {
          if (prev.crash?.id !== incoming.crash.id) {
            pushEvent('New crash round started');
          } else if (prev.crash?.phase !== incoming.crash.phase) {
            pushEvent(`Crash phase → ${incoming.crash.phase}`);
          }
        }

        if (incoming.mode === 'duel_ab' && incoming.duel) {
          if (prev.duel?.id !== incoming.duel.id) {
            pushEvent('New duel round started');
          } else if (prev.duel?.phase !== incoming.duel.phase) {
            pushEvent(`Duel phase → ${incoming.duel.phase}`);
          }
          if (incoming.duel.winner && prev.duel?.winner !== incoming.duel.winner) {
            pushEvent(`Duel winner · ${incoming.duel.winner}`);
          }
        }
      }
      return incoming;
    });
  }, [pushEvent]);

  useEffect(() => {
    const socket = createWS((message: any) => {
      if (message.t === 'hello') {
        uid.current = typeof message.uid === 'string' ? message.uid : '';
        if (uid.current) persistUid(uid.current);
        setWallet(Number(message.wallet?.balance ?? 0));
        handleSnapshot(message.snapshot as Snapshot);
        pushEvent(`Connected as ${uid.current || 'guest'}`);
      } else if (message.t === 'wallet') {
        const balance = Number(message.wallet?.balance ?? 0);
        setWallet(balance);
        pushEvent(`Wallet updated · ${formatCents(balance)}`);
      } else if (message.t === 'snapshot') {
        handleSnapshot(message.snapshot as Snapshot);
      } else if (message.t === 'event') {
        const text = typeof message.payload?.message === 'string' ? message.payload.message : message.kind;
        if (text) pushEvent(text);
      } else if (message.t === 'error') {
        pushEvent(`Error: ${message.message}`);
      }
    });

    const onClose = () => pushEvent('Connection closed');
    socket.addEventListener('close', onClose);
    setWS(socket);
    return () => {
      socket.removeEventListener('close', onClose);
      socket.close();
    };
  }, [handleSnapshot, pushEvent]);

  const send = useCallback((payload: any) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, [ws]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as PanelId;
    if (!(PANEL_IDS as readonly string[]).includes(activeId)) return;

    setLayout((prev) => {
      const sourceColumn = COLUMN_KEYS.find((column) => prev[column].includes(activeId));
      if (!sourceColumn) return prev;

      const sourceIndex = prev[sourceColumn].indexOf(activeId);
      const overId = over.id as string;
      let targetColumn: ColumnKey | undefined;
      let targetIndex: number;

      if ((COLUMN_KEYS as readonly string[]).includes(overId)) {
        targetColumn = overId as ColumnKey;
        targetIndex = prev[targetColumn].length;
      } else if ((PANEL_IDS as readonly string[]).includes(overId)) {
        targetColumn = COLUMN_KEYS.find((column) => prev[column].includes(overId as PanelId));
        if (!targetColumn) return prev;
        targetIndex = prev[targetColumn].indexOf(overId as PanelId);
        if (targetColumn === sourceColumn && targetIndex > sourceIndex) {
          targetIndex -= 1;
        }
      } else {
        return prev;
      }

      if (!targetColumn) return prev;
      if (targetColumn === sourceColumn && targetIndex === sourceIndex) return prev;

      const next = cloneLayout(prev);
      next[sourceColumn].splice(sourceIndex, 1);
      const boundedIndex = Math.max(0, Math.min(targetIndex, next[targetColumn].length));
      next[targetColumn].splice(boundedIndex, 0, activeId);
      return next;
    });
  }, []);

  const readyState = ws?.readyState ?? WebSocket.CLOSED;
  const isLive = readyState === WebSocket.OPEN;
  const connectionLabel = readyState === WebSocket.OPEN ? 'Live' : readyState === WebSocket.CONNECTING ? 'Connecting' : 'Offline';
  const connectionTone: BadgeTone = readyState === WebSocket.OPEN ? 'success' : readyState === WebSocket.CONNECTING ? 'warning' : 'danger';

  const mode: GameMode = snap?.mode ?? 'crash_dual';
  const crashRound = snap?.crash;
  const duelRound = snap?.duel;
  const roundStats: RoundStats | undefined = snap?.stats;

  const now = Date.now();
  const crashTimeLeft = crashRound ? Math.max(0, crashRound.endsAt - now) : 0;
  const duelTimeLeft = duelRound ? Math.max(0, duelRound.endsAt - now) : 0;

  useEffect(() => {
    if (!crashRound) {
      if (mode !== 'crash_dual' && targetRoundId !== null) setTargetRoundId(null);
      return;
    }
    if (targetRoundId === crashRound.id) return;
    setTargetInputs({ A: crashRound.targetA.toFixed(2), B: crashRound.targetB.toFixed(2) });
    setTargetRoundId(crashRound.id);
  }, [crashRound, mode, targetRoundId]);

  useEffect(() => {
    const roundId = mode === 'crash_dual' ? crashRound?.id ?? null : duelRound?.id ?? null;
    const phase = mode === 'crash_dual' ? crashRound?.phase : duelRound?.phase;
    if (phase !== 'betting') {
      lastBet.current = null;
      return;
    }
    if (lastBet.current && (lastBet.current.mode !== mode || lastBet.current.roundId !== roundId)) {
      lastBet.current = null;
    }
  }, [crashRound?.id, crashRound?.phase, duelRound?.id, duelRound?.phase, mode]);

  const targetPlans = useMemo<Record<Side, number | null>>(() => {
    const parse = (value: string) => {
      const next = Number.parseFloat(value);
      return Number.isFinite(next) ? next : null;
    };
    return { A: parse(targetInputs.A), B: parse(targetInputs.B) };
  }, [targetInputs.A, targetInputs.B]);

  const crashTotals = useMemo(() => {
    if (!crashRound) return { totalA: 0, totalB: 0, countA: 0, countB: 0 };
    const totalA = crashRound.betsA?.reduce((sum, bet) => sum + Number(bet.amount ?? 0), 0) ?? 0;
    const totalB = crashRound.betsB?.reduce((sum, bet) => sum + Number(bet.amount ?? 0), 0) ?? 0;
    return { totalA, totalB, countA: crashRound.betsA?.length ?? 0, countB: crashRound.betsB?.length ?? 0 };
  }, [crashRound]);

  const duelTotals = useMemo(() => {
    if (!duelRound) return { total: 0, totalA: 0, totalB: 0, countA: 0, countB: 0 };
    let totalA = 0, totalB = 0, countA = 0, countB = 0;
    for (const bet of duelRound.bets ?? []) {
      const amount = Number(bet.amount ?? 0);
      if (bet.side === 'A') { totalA += amount; countA += 1; } else if (bet.side === 'B') { totalB += amount; countB += 1; }
    }
    return { total: totalA + totalB, totalA, totalB, countA, countB };
  }, [duelRound]);

  const activePhase = mode === 'crash_dual' ? crashRound?.phase : duelRound?.phase;
  const phaseTone = activePhase ? phaseToneMap[activePhase] ?? 'muted' : 'muted';
  const modeLabel = formatMode(mode);

  const riskProfile = useMemo(() => {
    if (!snap) return { tone: 'muted' as BadgeTone, label: 'Unknown', hint: 'Awaiting data' };
    if (wallet <= 0) return { tone: 'danger' as BadgeTone, label: 'Critical', hint: 'Balance depleted' };
    const rtp = Number.isFinite(snap.rtpAvg) ? snap.rtpAvg : 0;
    if (wallet < 15_000) return { tone: 'warning' as BadgeTone, label: 'High risk', hint: 'Low balance reserves' };
    if (rtp < 96) return { tone: 'warning' as BadgeTone, label: 'Volatile', hint: 'RTP trending low' };
    if (rtp > 103) return { tone: 'success' as BadgeTone, label: 'Advantage', hint: 'Payouts above expectation' };
    return { tone: 'secondary' as BadgeTone, label: 'Balanced', hint: 'Within comfort zone' };
  }, [snap, wallet]);

  const sanitizedAmount = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  const canPlaceBet =
    isLive &&
    sanitizedAmount > 0 &&
    sanitizedAmount <= wallet &&
    ((mode === 'crash_dual' && crashRound?.phase === 'betting') || (mode === 'duel_ab' && duelRound?.phase === 'betting'));
  const canCashout = isLive && mode === 'crash_dual' && crashRound?.phase === 'running';
  const canAdjustMicro = isLive && mode === 'duel_ab';
  const sliderMax = useMemo(() => Math.max(10_000, wallet, sanitizedAmount), [sanitizedAmount, wallet]);
  const sliderStep = sliderMax > 50_000 ? 2_500 : sliderMax > 20_000 ? 1_000 : 500;
  const sliderDisabled = wallet <= 0 && sanitizedAmount <= 0;
  const canEditTargets = mode === 'crash_dual' && !!crashRound;

  const adjustAmount = useCallback((delta: number) => {
    setAmount((prev) => {
      const base = Number.isFinite(prev) ? prev : 0;
      const next = base + delta;
      const rounded = Math.max(0, Math.round(next));
      return wallet > 0 ? Math.min(rounded, wallet) : rounded;
    });
  }, [wallet]);

  const toggleSide = useCallback(() => setSide((prev) => (prev === 'A' ? 'B' : 'A')), []);

  const requestTopUp = useCallback((value: number) => {
    if (value <= 0) return;
    if (!isLive) { pushEvent('Top-up unavailable while offline'); return; }
    const amountToSend = Math.max(1, Math.round(value));
    send({ t: 'topup', amount: amountToSend });
    pushEvent(`Top-up requested · ${formatCents(amountToSend)}`);
  }, [isLive, pushEvent, send]);

  const resetTargetsToRound = useCallback(() => {
    if (!crashRound) { setTargetInputs({ A: '', B: '' }); setTargetRoundId(null); return; }
    setTargetInputs({ A: crashRound.targetA.toFixed(2), B: crashRound.targetB.toFixed(2) });
    setTargetRoundId(crashRound.id);
  }, [crashRound]);

  const targetOffsets = useMemo(() => ({
    A: crashRound && targetPlans.A != null ? targetPlans.A - crashRound.targetA : null,
    B: crashRound && targetPlans.B != null ? targetPlans.B - crashRound.targetB : null
  }), [crashRound, targetPlans]);

  const activeTargetPlan = targetPlans[side];

  const placeBet = useCallback(() => {
    const value = sanitizedAmount;
    const phaseOk = (mode === 'crash_dual' && crashRound?.phase === 'betting') || (mode === 'duel_ab' && duelRound?.phase === 'betting');
    if (!isLive || !phaseOk || value <= 0 || value > wallet) return;
    const roundId = mode === 'crash_dual' ? crashRound?.id ?? null : duelRound?.id ?? null;
    const amountToSend = Math.max(1, Math.round(value));
    const previous = lastBet.current;
    const shouldReuseBetId =
      !!previous &&
      previous.amount === amountToSend &&
      previous.side === side &&
      previous.mode === mode &&
      previous.roundId === roundId;
    const betId = shouldReuseBetId ? previous.betId : generateBetId();
    const payload = { t: 'bet', amount: amountToSend, side, betId };
    send(payload);
    lastBet.current = { amount: amountToSend, side, mode, roundId, betId };
    const plannedTarget = targetPlans[side];
    const planSuffix = mode === 'crash_dual' && plannedTarget != null ? ` (target ${formatMultiplier(plannedTarget)})` : '';
    pushEvent(`Bet placed · ${formatCents(payload.amount)} on side ${side}${planSuffix}`);
  }, [
    crashRound?.id, crashRound?.phase, duelRound?.id, duelRound?.phase,
    isLive, mode, pushEvent, sanitizedAmount, send, side, targetPlans, wallet
  ]);

  const cashout = useCallback(() => {
    if (!isLive || mode !== 'crash_dual' || crashRound?.phase !== 'running') return;
    send({ t: 'cashout' });
    pushEvent('Cashout requested');
  }, [crashRound?.phase, isLive, mode, pushEvent, send]);

  const switchMode = useCallback((nextMode: GameMode) => {
    if (!isLive || nextMode === mode) return;
    send({ t: 'switch_mode', mode: nextMode });
    pushEvent(`Switching to ${formatMode(nextMode)}…`);
  }, [isLive, mode, pushEvent, send]);

  const adjustMicro = useCallback((targetSide: Side, stat: 'speed' | 'defense', delta: number) => {
    if (!isLive || mode !== 'duel_ab' || delta === 0) return;
    send({ t: 'micro', side: targetSide, what: stat, value: delta });
    pushEvent(`Adjusted ${stat} ${targetSide} by ${delta > 0 ? '+' : ''}${delta}`);
  }, [isLive, mode, pushEvent, send]);

  const parameterMetrics: Array<{ label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode }> =
    mode === 'crash_dual'
      ? (crashRound
          ? [
              { label: 'Round ID', value: shortId(crashRound.id) },
              { label: 'Phase', value: crashRound.phase },
              { label: 'Time left', value: formatSeconds(crashTimeLeft) },
              { label: 'A multiplier', value: formatMultiplier(crashRound.mA), hint: `Target ${formatMultiplier(crashRound.targetA)}` },
              { label: 'B multiplier', value: formatMultiplier(crashRound.mB), hint: `Target ${formatMultiplier(crashRound.targetB)}` },
              { label: 'Burned', value: formatCents(crashRound.burned) },
              { label: 'Payouts', value: formatCents(crashRound.payouts) }
            ]
          : [])
      : (duelRound
          ? [
              { label: 'Round ID', value: shortId(duelRound.id) },
              { label: 'Phase', value: duelRound.phase },
              { label: 'Time left', value: formatSeconds(duelTimeLeft) },
              { label: 'Pot size', value: formatCents(duelTotals.total) },
              { label: 'A speed', value: duelRound.micro.A.speed },
              { label: 'A defense', value: duelRound.micro.A.defense },
              { label: 'B speed', value: duelRound.micro.B.speed },
              { label: 'B defense', value: duelRound.micro.B.defense },
              { label: 'Winner', value: duelRound.winner ?? '—' }
            ]
          : []);

  const eventTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const renderWalletCard = () => (
    <Card title="Wallet &amp; Mode" subtitle="Session overview">
      <CardBody>
        <WalletBalance>
          <WalletBalanceLabel>Balance</WalletBalanceLabel>
          <WalletBalanceValue>{formatCents(wallet)}</WalletBalanceValue>
          <WalletBalanceTags>
            <Badge tone={connectionTone}>Connection · {connectionLabel}</Badge>
            <Badge tone={riskProfile.tone}>Risk · {riskProfile.label}</Badge>
          </WalletBalanceTags>
        </WalletBalance>

        <WalletTopups>
          {QUICK_TOPUPS.map((value) => (
            <Button
              key={value}
              type="button"
              $variant="secondary"
              $compact
              onClick={() => requestTopUp(value)}
              disabled={!isLive}
            >
              +{formatCents(value)}
            </Button>
          ))}
        </WalletTopups>
        <WalletTopupsHint>Quickly add funds before the next round begins.</WalletTopupsHint>

        <WalletTargets>
          <WalletTargetsHeader>
            <span>Crash multipliers</span>
            <Button type="button" $variant="muted" $compact onClick={resetTargetsToRound} disabled={!crashRound}>
              Reset
            </Button>
          </WalletTargetsHeader>
          <WalletTargetsInputs>
            <WalletTargetsInput>
              <label htmlFor="target-a">Side A</label>
              <input
                id="target-a"
                type="number"
                inputMode="decimal"
                min={1}
                step={0.01}
                value={targetInputs.A}
                onChange={(e) => setTargetInputs((prev) => ({ ...prev, A: e.target.value }))}
                onBlur={(e) => {
                  const parsed = Number.parseFloat(e.target.value);
                  setTargetInputs((prev) => ({ ...prev, A: Number.isFinite(parsed) ? Math.max(1, parsed).toFixed(2) : '' }));
                }}
                disabled={!canEditTargets}
              />
            </WalletTargetsInput>
            <WalletTargetsInput>
              <label htmlFor="target-b">Side B</label>
              <input
                id="target-b"
                type="number"
                inputMode="decimal"
                min={1}
                step={0.01}
                value={targetInputs.B}
                onChange={(e) => setTargetInputs((prev) => ({ ...prev, B: e.target.value }))}
                onBlur={(e) => {
                  const parsed = Number.parseFloat(e.target.value);
                  setTargetInputs((prev) => ({ ...prev, B: Number.isFinite(parsed) ? Math.max(1, parsed).toFixed(2) : '' }));
                }}
                disabled={!canEditTargets}
              />
            </WalletTargetsInput>
          </WalletTargetsInputs>
          <WalletTargetsFoot>
            {crashRound ? (
              <>
                <WalletTargetsRound>
                  Round · A {formatMultiplier(crashRound.targetA)} · B {formatMultiplier(crashRound.targetB)}
                </WalletTargetsRound>
                <WalletTargetsDelta>
                  Plan offset:&nbsp;
                  <strong>A {targetOffsets.A != null ? formatMultiplierDelta(targetOffsets.A) : '—'}</strong>
                  <WalletTargetsDivider>·</WalletTargetsDivider>
                  <strong>B {targetOffsets.B != null ? formatMultiplierDelta(targetOffsets.B) : '—'}</strong>
                </WalletTargetsDelta>
              </>
            ) : (
              <Badge tone="muted">Targets available in Crash Dual mode</Badge>
            )}
          </WalletTargetsFoot>
        </WalletTargets>

        <WalletMetrics>
          <WalletMetricRow label="UID" value={uid.current || '—'} align="start" />
          <WalletMetricRow
            label="Active mode"
            value={<Badge tone="primary">{modeLabel}</Badge>}
            hint={`Phase ${activePhase ?? '—'}`}
            align="start"
          />
          <WalletMetricRow label="Connection" value={<Badge tone={connectionTone}>{connectionLabel}</Badge>} align="start" />
          <WalletMetricRow label="RTP (avg)" value={`${(snap?.rtpAvg ?? 0).toFixed(2)}%`} hint="House rolling average" />
          <WalletMetricRow
            label="Risk status"
            value={<Badge tone={riskProfile.tone}>{riskProfile.label}</Badge>}
            hint={riskProfile.hint}
            align="start"
          />
          <WalletMetricRow label="Rounds played" value={snap?.rounds ?? 0} />
        </WalletMetrics>
      </CardBody>
    </Card>
  );

  const renderBetCard = () => (
    <Card title="Main bet" subtitle="Place wagers on the active game">
      <CardBody>
        <ControlGroup>
          <ControlLabel htmlFor="bet-amount">Bet amount</ControlLabel>
          <input
            id="bet-amount"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => {
              const next = Number(e.target.value);
              setAmount(Number.isFinite(next) ? Math.max(0, next) : 0);
            }}
          />
        </ControlGroup>

        <BetStepper>
          <Button
            type="button"
            $variant="muted"
            $compact
            onClick={() => adjustAmount(-sliderStep)}
            disabled={sanitizedAmount <= 0}
          >
            −{formatCents(sliderStep)}
          </Button>
          <BetStepperValue>{formatCents(sanitizedAmount)}</BetStepperValue>
          <Button
            type="button"
            $variant="secondary"
            $compact
            onClick={() => adjustAmount(sliderStep)}
            disabled={wallet <= 0}
          >
            +{formatCents(sliderStep)}
          </Button>
        </BetStepper>

        <BetPresets>
          {BET_PRESETS.map((value) => (
            <Button
              key={value}
              type="button"
              $variant="muted"
              $compact
              $active={sanitizedAmount === Math.min(value, wallet > 0 ? wallet : value)}
              onClick={() => setAmount(wallet > 0 ? Math.min(value, wallet) : value)}
            >
              {formatCents(value)}
            </Button>
          ))}
        </BetPresets>

        <BetSlider>
          <ControlLabel htmlFor="bet-slider">Quick adjust</ControlLabel>
          <input
            id="bet-slider"
            type="range"
            min={0}
            max={sliderMax}
            step={sliderStep}
            value={sanitizedAmount}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              const normalized = Math.max(0, Math.round(next));
              setAmount(wallet > 0 ? Math.min(normalized, wallet) : normalized);
            }}
            disabled={sliderDisabled}
          />
          <BetSliderScale>
            <span>{formatCents(0)}</span>
            <span>{formatCents(sliderMax)}</span>
          </BetSliderScale>
        </BetSlider>

        <BetSideOverview>
          <BetSideChip $side={side}>
            <BetSideChipLabel>Selected</BetSideChipLabel>
            <BetSideChipValue>Side {side}</BetSideChipValue>
            {mode === 'crash_dual' && (
              <BetSideChipPlan>
                Target · {activeTargetPlan != null ? formatMultiplier(activeTargetPlan) : '—'}
              </BetSideChipPlan>
            )}
          </BetSideChip>
          <BetSideActions>
            <Button type="button" $variant="muted" $compact $active={side === 'A'} onClick={() => setSide('A')}>
              A
            </Button>
            <Button type="button" $variant="muted" $compact $active={side === 'B'} onClick={() => setSide('B')}>
              B
            </Button>
            <Button type="button" $variant="secondary" $compact onClick={toggleSide}>
              Swap
            </Button>
          </BetSideActions>
        </BetSideOverview>

        <ButtonRow>
          <Button type="button" $variant="primary" onClick={placeBet} disabled={!canPlaceBet}>
            Place bet
          </Button>
          {mode === 'crash_dual' && (
            <Button type="button" $variant="secondary" onClick={cashout} disabled={!canCashout}>
              Cash out
            </Button>
          )}
        </ButtonRow>
        <MutedText>Betting is available during the betting phase.</MutedText>
      </CardBody>
    </Card>
  );

  const renderMicroCard = () => (
    <Card title="Micro-bets" subtitle="Fine-tune duel combatants">
      <CardBody>
        <ControlGroup>
          <ControlLabel htmlFor="micro-step">Adjustment step</ControlLabel>
          <input
            id="micro-step"
            type="number"
            min={1}
            value={microStep}
            onChange={(e) => {
              const next = Number(e.target.value);
              setMicroStep(Number.isFinite(next) ? Math.max(1, Math.min(50, Math.floor(next))) : 1);
            }}
          />
        </ControlGroup>
        {!canAdjustMicro && <Badge tone="warning">Switch to duel mode to adjust stats</Badge>}
        <MicroGrid>
          {(['A', 'B'] as const).map((target) => (
            <MicroSide key={target}>
              <MicroSideHeader>
                <Badge tone="secondary">Side {target}</Badge>
              </MicroSideHeader>
              <MicroStat>
                <MetricRow label="Speed" value={duelRound?.micro?.[target]?.speed ?? 0} />
                <MicroControls>
                  <Button
                    type="button"
                    $variant="secondary"
                    onClick={() => adjustMicro(target, 'speed', microStep)}
                    disabled={!canAdjustMicro}
                  >
                    +{microStep}
                  </Button>
                  <Button
                    type="button"
                    $variant="muted"
                    onClick={() => adjustMicro(target, 'speed', -microStep)}
                    disabled={!canAdjustMicro}
                  >
                    -{microStep}
                  </Button>
                </MicroControls>
              </MicroStat>
              <MicroStat>
                <MetricRow label="Defense" value={duelRound?.micro?.[target]?.defense ?? 0} />
                <MicroControls>
                  <Button
                    type="button"
                    $variant="secondary"
                    onClick={() => adjustMicro(target, 'defense', microStep)}
                    disabled={!canAdjustMicro}
                  >
                    +{microStep}
                  </Button>
                  <Button
                    type="button"
                    $variant="muted"
                    onClick={() => adjustMicro(target, 'defense', -microStep)}
                    disabled={!canAdjustMicro}
                  >
                    -{microStep}
                  </Button>
                </MicroControls>
              </MicroStat>
            </MicroSide>
          ))}
        </MicroGrid>
      </CardBody>
    </Card>
  );

  const renderArenaCard = () => (
    <Card title="Game arena" subtitle={modeLabel}>
      <ArenaCardBody>
        <ArenaGrid>
          <ArenaStage>
            {mode === 'crash_dual' && crashRound && (
              <CrashDualCanvas
                mA={crashRound.mA}
                mB={crashRound.mB}
                targetA={crashRound.targetA}
                targetB={crashRound.targetB}
                phase={crashRound.phase}
              />
            )}
            {mode === 'duel_ab' && duelRound && (
              <DuelABPanel micro={duelRound.micro} phase={duelRound.phase} winner={duelRound.winner} />
            )}
            {!((mode === 'crash_dual' && crashRound) || (mode === 'duel_ab' && duelRound)) && (
              <ArenaEmpty>No round data yet</ArenaEmpty>
            )}
          </ArenaStage>
          <ArenaSidebar>
            <ArenaSidebarTitle>Round parameters</ArenaSidebarTitle>
            <ArenaParameters>
              {parameterMetrics.length === 0 && <MutedText>Waiting for round data…</MutedText>}
              {parameterMetrics.map((metric) => (
                <MetricRow key={String(metric.label)} label={metric.label} value={metric.value} hint={metric.hint} />
              ))}
            </ArenaParameters>
          </ArenaSidebar>
        </ArenaGrid>
      </ArenaCardBody>
    </Card>
  );

  const renderInvestorCard = () => (
    <Card title="Investor panel" subtitle="House overview">
      <CardBody>
        <MetricRow
          label="Connection"
          value={<Badge tone={connectionTone}>{connectionLabel}</Badge>}
          hint={isLive ? 'Realtime updates active' : 'Reconnect to resume updates'}
        />
        <MetricRow label="Bankroll" value={formatCents(snap?.bankroll ?? 0)} />
        <MetricRow label="Jackpot" value={formatCents(snap?.jackpot ?? 0)} />
        <MetricRow label="RTP average" value={`${(snap?.rtpAvg ?? 0).toFixed(2)}%`} />
        <MetricRow label="Total rounds" value={snap?.rounds ?? 0} />
      </CardBody>
    </Card>
  );

  const renderStatsCard = () => (
    <Card title="Round statistics" subtitle="Performance snapshot">
      <CardBody>
        <MetricRow label="Completed rounds" value={roundStats?.totalRounds ?? snap?.rounds ?? 0} />
        <MetricRow label="Crash rounds" value={roundStats?.crashRounds ?? 0} />
        <MetricRow label="Duel rounds" value={roundStats?.duelRounds ?? 0} />
        <MetricRow label="Total wagers" value={formatCents(roundStats?.totalWagered ?? 0)} />
        <MetricRow label="Operator profit" value={formatCents(roundStats?.operatorProfit ?? 0)} />
        <MetricRow
          label="Operator edge"
          value={formatPercent(roundStats?.operatorEdge ?? 0)}
          hint={`Target ${formatPercent(roundStats?.operatorEdgeTarget ?? 4)}`}
        />
      </CardBody>
    </Card>
  );

  const renderTotalsCard = () => (
    <Card title="Round totals" subtitle={`${modeLabel} pools`}>
      <CardBody>
        {mode === 'crash_dual' && crashRound && (
          <>
            <MetricRow label="Total pool" value={formatCents(crashTotals.totalA + crashTotals.totalB)} />
            <MetricRow label="Side A" value={formatCents(crashTotals.totalA)} hint={`${crashTotals.countA} bets`} />
            <MetricRow label="Side B" value={formatCents(crashTotals.totalB)} hint={`${crashTotals.countB} bets`} />
            <MetricRow label="Burned" value={formatCents(crashRound.burned)} />
            <MetricRow label="Payouts" value={formatCents(crashRound.payouts)} />
          </>
        )}
        {mode === 'duel_ab' && duelRound && (
          <>
            <MetricRow label="Total pot" value={formatCents(duelTotals.total)} />
            <MetricRow label="Side A" value={formatCents(duelTotals.totalA)} hint={`${duelTotals.countA} bets`} />
            <MetricRow label="Side B" value={formatCents(duelTotals.totalB)} hint={`${duelTotals.countB} bets`} />
            <MetricRow label="Winner" value={duelRound.winner ?? '—'} />
          </>
        )}
        {!((mode === 'crash_dual' && crashRound) || (mode === 'duel_ab' && duelRound)) && (
          <MutedText>Totals will appear when a round begins.</MutedText>
        )}
      </CardBody>
    </Card>
  );

  const renderEventsCard = () => (
    <Card title="Events" subtitle="Latest activity">
      <CardBody>
        {events.length === 0 ? (
          <MutedText>No events yet. Place a bet to get started.</MutedText>
        ) : (
          <EventList>
            {events.map((entry) => (
              <EventItem key={entry.id}>
                <EventTime>{eventTime(entry.ts)}</EventTime>
                <EventText>{entry.text}</EventText>
              </EventItem>
            ))}
          </EventList>
        )}
      </CardBody>
    </Card>
  );

  const panels: Record<PanelId, () => React.ReactNode> = {
    wallet: renderWalletCard,
    bet: renderBetCard,
    micro: renderMicroCard,
    arena: renderArenaCard,
    investor: renderInvestorCard,
    stats: renderStatsCard,
    totals: renderTotalsCard,
    events: renderEventsCard
  };

  const ColumnSection = ({ column }: { column: ColumnKey }) => {
    const { setNodeRef, isOver } = useDroppable({ id: column });
    const columnPanels = layout[column];

    return (
      <Column ref={setNodeRef} $isDropping={isOver}>
        <SortableContext items={columnPanels} strategy={verticalListSortingStrategy}>
          {columnPanels.map((panelId) => {
            const render = panels[panelId];
            if (!render) return null;
            return (
              <SortablePanel key={panelId} id={panelId}>
                {render()}
              </SortablePanel>
            );
          })}
        </SortableContext>
        <ColumnPlaceholder aria-hidden="true" />
      </Column>
    );
  };

  return (
    <AppShell>
      <Header>
        <HeaderTitle>
          <HeaderLogo aria-hidden="true">✦</HeaderLogo>
          <HeaderCopy>
            <HeaderEyebrow>Realtime casino sandbox</HeaderEyebrow>
            <h1>Clash Dual</h1>
            <HeaderLead>Balance crash flights and duel skirmishes from one cinematic control room.</HeaderLead>
          </HeaderCopy>
        </HeaderTitle>

        <HeaderBadges>
          <HeaderBadgeRow>
            <Badge tone={connectionTone}>Connection · {connectionLabel}</Badge>
            <Badge tone="primary">Mode · {modeLabel}</Badge>
            <Badge tone={phaseTone}>Phase · {activePhase ?? '—'}</Badge>
            <Badge tone="muted">Rounds · {snap?.rounds ?? 0}</Badge>
          </HeaderBadgeRow>
          <HeaderHint>Monitor live telemetry, tweak multipliers, and launch your bets the moment the skies align.</HeaderHint>
        </HeaderBadges>

        <HeaderControls>
          <HeaderControlsGroup>
            <HeaderControlsLabel>Game mode</HeaderControlsLabel>
            <HeaderSegmented role="group" aria-label="Select game mode">
              <SegmentedButton
                type="button"
                $active={mode === 'crash_dual'}
                onClick={() => switchMode('crash_dual')}
                disabled={!isLive || mode === 'crash_dual'}
              >
                Crash
              </SegmentedButton>
              <SegmentedButton
                type="button"
                $active={mode === 'duel_ab'}
                onClick={() => switchMode('duel_ab')}
                disabled={!isLive || mode === 'duel_ab'}
              >
                A/B Duel
              </SegmentedButton>
            </HeaderSegmented>
            <HeaderControlsHint>Switch modes while connected to explore both arenas.</HeaderControlsHint>
          </HeaderControlsGroup>
        </HeaderControls>
      </Header>

      <Main>
        <IntroSection>
          <IntroCopy>
            <h2>Command center</h2>
            <p>Choose your side, track the pools, and react instantly to shifting phases.</p>
          </IntroCopy>
          <Summary>
            <SummaryItem>
              <SummaryLabel>Wallet</SummaryLabel>
              <SummaryValue>{formatCents(wallet)}</SummaryValue>
            </SummaryItem>
            <SummaryItem>
              <SummaryLabel>Game mode</SummaryLabel>
              <SummaryValue>{modeLabel}</SummaryValue>
            </SummaryItem>
            <SummaryItem>
              <SummaryLabel>Risk profile</SummaryLabel>
              <SummaryValue>{riskProfile.label}</SummaryValue>
            </SummaryItem>
            <SummaryItem>
              <SummaryLabel>Operator edge</SummaryLabel>
              <SummaryValue>{formatPercent(roundStats?.operatorEdge ?? 0)}</SummaryValue>
            </SummaryItem>
            <SummaryItem>
              <SummaryLabel>Rounds played</SummaryLabel>
              <SummaryValue>{snap?.rounds ?? 0}</SummaryValue>
            </SummaryItem>
          </Summary>
        </IntroSection>

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <Layout>
            <ColumnSection column="main" />
          </Layout>
        </DndContext>
      </Main>

      <AppFooter>
        <AppFooterInner>
          <AppFooterBrand>Clash Dual playground</AppFooterBrand>
          <AppFooterNote>Simulation environment for crash and duel mechanics.</AppFooterNote>
        </AppFooterInner>
      </AppFooter>

      <BuildIndicator>
        <span>Build</span>
        <BuildIndicatorCommit>{commit}</BuildIndicatorCommit>
      </BuildIndicator>
    </AppShell>
  );
}
