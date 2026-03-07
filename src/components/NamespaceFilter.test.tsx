import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NamespaceFilter } from './NamespaceFilter';

describe('NamespaceFilter', () => {
  afterEach(cleanup);

  it('shows empty state when no namespaces', () => {
    render(
      <NamespaceFilter
        allNamespaces={[]}
        activeNamespaces={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('No namespaces captured yet.')).toBeInTheDocument();
  });

  it('renders a button for each namespace', () => {
    render(
      <NamespaceFilter
        allNamespaces={['/telemetry', '/device']}
        activeNamespaces={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '/telemetry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '/device' })).toBeInTheDocument();
  });

  it('renders empty namespace as (root)', () => {
    render(
      <NamespaceFilter
        allNamespaces={['']}
        activeNamespaces={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '(root)' })).toBeInTheDocument();
  });

  it('active namespace button has ns-btn--active class', () => {
    render(
      <NamespaceFilter
        allNamespaces={['/telemetry', '/device']}
        activeNamespaces={new Set(['/telemetry'])}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '/telemetry' }).className).toContain('ns-btn--active');
    expect(screen.getByRole('button', { name: '/device' }).className).not.toContain('ns-btn--active');
  });

  it('calls onToggle with namespace when button clicked', () => {
    const onToggle = vi.fn();
    render(
      <NamespaceFilter
        allNamespaces={['/telemetry']}
        activeNamespaces={new Set(['/telemetry'])}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '/telemetry' }));
    expect(onToggle).toHaveBeenCalledWith('/telemetry');
  });
});
