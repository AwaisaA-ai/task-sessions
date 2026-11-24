import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders a native progressbar with an accessible name and value', () => {
    render(
      <ProgressBar
        progress={{ total: 3, done: 1, percent: 33, label: '1 of 3 tasks done' }}
        label="Weekly review progress"
      />,
    );

    const bar = screen.getByRole('progressbar', { name: 'Weekly review progress' });

    expect(bar).toBeInstanceOf(HTMLProgressElement);
    expect((bar as HTMLProgressElement).value).toBe(33);
    expect((bar as HTMLProgressElement).max).toBe(100);
  });

  it('shows the percentage as visible text', () => {
    render(
      <ProgressBar
        progress={{ total: 3, done: 3, percent: 100, label: 'All 3 tasks done' }}
        label="Weekly review progress"
      />,
    );

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('can hide the percentage text when the row supplies its own label', () => {
    render(
      <ProgressBar
        progress={{ total: 0, done: 0, percent: 0, label: 'No tasks yet' }}
        label="Empty session progress"
        showPercent={false}
      />,
    );

    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
