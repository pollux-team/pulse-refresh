import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { VisualTimerOverlay } from '@/src/components/content/VisualTimerOverlay';
import { FeatureTodoPanel } from '@/src/components/options/FeatureTodoPanel';
import { OptionsApp } from '@/src/components/options/OptionsApp';
import { PopupApp } from '@/src/components/popup/PopupApp';
import { handleRuntimeMessage } from '@/src/lib/background-controller';
import {
  createDefaultGlobalState,
  createDefaultTabJob,
} from '@/src/lib/defaults';

describe('UI Components — Visual Timer, Extension Popup & Production Options Dashboard', () => {
  it('renders VisualTimerOverlay countdown, refresh counter, and fires pause/stop callbacks', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onStop = vi.fn();

    const job = {
      ...createDefaultTabJob({ tabId: 1, url: 'https://store.nordicgear.com' }),
      status: 'running' as const,
      refreshCount: 3,
      currentIntervalMs: 30_000,
      nextRefreshAt: Date.now() + 25_000,
    };
    job.refresh.maxRefreshes = 10;

    render(
      <VisualTimerOverlay
        job={job}
        onPause={onPause}
        onResume={onResume}
        onStop={onStop}
        contained
      />,
    );

    expect(screen.getByTestId('visual-timer-overlay')).toBeInTheDocument();
    expect(screen.getByText(/#3\/10/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Pause refresh'));
    expect(onPause).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Stop refresh'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('renders PopupApp with brand logo, clean production copy, and starts + stops an auto-refresh job', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([
      {
        id: 5,
        windowId: 1,
        url: 'https://store.nordicgear.com/products/rtx-5080',
        title: 'GeForce RTX 5080 — NordicGear',
      },
    ] as never);
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      (msg: unknown) => handleRuntimeMessage(msg as never) as Promise<never>,
    );

    const { container } = render(<PopupApp embedded />);

    await waitFor(() => {
      expect(screen.getByText('GeForce RTX 5080 — NordicGear')).toBeInTheDocument();
    });

    // Verify zero dev/meta strings in shipping Popup UI
    expect(container.textContent).not.toMatch(/To-Do|WXT|shadcn|Vitest|BYO/i);

    // Select 30s preset and start auto-refresh
    fireEvent.click(screen.getByRole('button', { name: '30s' }));
    fireEvent.click(screen.getByRole('button', { name: /Start Auto Refresh/i }));

    await waitFor(() => {
      expect(screen.getByTestId('popup-live-banner')).toBeInTheDocument();
    });

    // Stop from live banner
    fireEvent.click(screen.getByRole('button', { name: /^Stop$/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('popup-live-banner')).not.toBeInTheDocument();
    });
  });

  it('renders production OptionsApp across all 7 settings sections with zero dev placeholder text', async () => {
    const { container } = render(<OptionsApp initialSection="refresh" embedded />);

    await waitFor(() => {
      expect(screen.getByText('Interval & Countdown Controls')).toBeInTheDocument();
    });
    expect(container.textContent).not.toMatch(/To-Do|WXT|shadcn|Vitest|BYO|Unlocked/i);

    const navChecks: Array<[RegExp, RegExp]> = [
      [/URL & Tabs/i, /Active Tabs List/i],
      [/Page Monitor/i, /Live Expression Sandbox/i],
      [/Alerts & Webhooks/i, /Webhook Integration/i],
      [/Automation & AI/i, /AI Automation Builder/i],
      [/Profiles & Sync/i, /Browser Sync & Backup/i],
      [/Activity Log/i, /Clear Log/i],
    ];

    for (const [navLabel, expectedHeading] of navChecks) {
      fireEvent.click(screen.getByRole('button', { name: navLabel }));
      await waitFor(() => {
        expect(screen.getByText(expectedHeading)).toBeInTheDocument();
      });
      expect(container.textContent).not.toMatch(/WXT|shadcn|Vitest|BYO Key|Unlocked/i);
    }
  });

  it('keeps FeatureTodoPanel independently verified at 42/42 features', async () => {
    const initial = createDefaultGlobalState();
    const onUpdateState = vi.fn(async (updater) => updater(initial));
    const onNavigate = vi.fn();
    const onNotify = vi.fn();

    render(
      <FeatureTodoPanel
        state={initial}
        onUpdateState={onUpdateState}
        onNavigateSection={onNavigate}
        onNotify={onNotify}
      />,
    );

    expect(screen.getByTestId('todo-progress-label')).toHaveTextContent(
      '42 of 42 features checked (100%)',
    );
    fireEvent.click(
      screen.getByLabelText('Mark Predefined Refresh Intervals completed'),
    );
    expect(onUpdateState).toHaveBeenCalledTimes(1);
  });
});
