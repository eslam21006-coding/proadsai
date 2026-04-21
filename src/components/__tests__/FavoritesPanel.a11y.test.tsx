// src/components/__tests__/FavoritesPanel.a11y.test.tsx — WCAG 2.1 AA automated audit (SC-007)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import FavoritesPanel from '../FavoritesPanel';
import type { AxeResults } from 'axe-core';

const mockUseFavorites = vi.fn();

vi.mock('../../hooks/useFavorites', () => ({
  useFavorites: (...args: unknown[]) => mockUseFavorites(...args),
}));

vi.mock('../../services/feedbackService', () => ({
  feedbackService: {
    toggleFavorite: vi.fn(() => Promise.resolve()),
  },
}));

const baseProps = {
  phase: 'hooks' as const,
  onLoad: vi.fn(),
  isOpen: true,
  onClose: vi.fn(),
};

function makeRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    output: {
      phase: 'hooks',
      hookText: `Hook text for ${id}`,
      fullResponse: `Full response for ${id}`,
    },
    feedback: { savedToFavorites: true },
    timestamp: { toDate: () => new Date(), toMillis: () => Date.now() },
    ...overrides,
  };
}

const axeOpts = {
  rules: {
    'color-contrast': { enabled: false },
    'page-has-heading-one': { enabled: false },
  },
};

function filterCriticalSerious(violations: AxeResults['violations']) {
  return violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
}

describe('FavoritesPanel a11y', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has no critical/serious violations — empty state', async () => {
    mockUseFavorites.mockReturnValue({
      favorites: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      connectionState: 'live',
    });

    const { container } = render(<FavoritesPanel {...baseProps} />);
    const results = await axe(container, axeOpts);
    const criticalOrSerious = filterCriticalSerious(results.violations);
    expect(criticalOrSerious).toHaveLength(0);
  });

  it('has no critical/serious violations — 3 items', async () => {
    mockUseFavorites.mockReturnValue({
      favorites: [
        makeRecord('1'),
        makeRecord('2', { output: { phase: 'hooks', hookText: 'Second hook', fullResponse: 'Full 2' } }),
        makeRecord('3', { output: { phase: 'hooks', hookText: 'Third hook', fullResponse: 'Full 3' } }),
      ],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      connectionState: 'live',
    });

    const { container } = render(<FavoritesPanel {...baseProps} />);
    const results = await axe(container, axeOpts);
    const criticalOrSerious = filterCriticalSerious(results.violations);
    expect(criticalOrSerious).toHaveLength(0);
  });

  it('has no critical/serious violations — 100 items with hasMore=true', async () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      makeRecord(`id-${i}`, {
        output: { phase: 'hooks', hookText: `Hook ${i}`, fullResponse: `Full ${i}` },
      })
    );
    mockUseFavorites.mockReturnValue({
      favorites: items,
      loading: false,
      hasMore: true,
      loadMore: vi.fn(),
      connectionState: 'live',
    });

    const { container } = render(<FavoritesPanel {...baseProps} />);
    const results = await axe(container, axeOpts);
    const criticalOrSerious = filterCriticalSerious(results.violations);
    expect(criticalOrSerious).toHaveLength(0);
  });

  it('has no critical/serious violations — connectionState stale with 3 items', async () => {
    mockUseFavorites.mockReturnValue({
      favorites: [
        makeRecord('1'),
        makeRecord('2', { output: { phase: 'hooks', hookText: 'Stale hook 2', fullResponse: 'Full 2' } }),
        makeRecord('3', { output: { phase: 'hooks', hookText: 'Stale hook 3', fullResponse: 'Full 3' } }),
      ],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      connectionState: 'stale',
    });

    const { container } = render(<FavoritesPanel {...baseProps} />);
    const results = await axe(container, axeOpts);
    const criticalOrSerious = filterCriticalSerious(results.violations);
    expect(criticalOrSerious).toHaveLength(0);
  });
});
