import React, { useEffect, useState } from 'react';
import { getCountdownProgress } from '@/src/lib/refresh-engine';
import type { TabJob, VisualTimerPosition } from '@/src/lib/types';
import { formatCountdown } from '@/src/lib/utils';

export interface VisualTimerOverlayProps {
  job: TabJob;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  /** When true, positions relative to parent container (for dashboard/preview demos). */
  contained?: boolean;
}

const POSITION_STYLES: Record<VisualTimerPosition, React.CSSProperties> = {
  'top-right': { top: 16, right: 16 },
  'top-left': { top: 16, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
};

export function VisualTimerOverlay({
  job,
  onPause,
  onResume,
  onStop,
  contained = false,
}: VisualTimerOverlayProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (job.status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [job.status, job.nextRefreshAt]);

  const vt = job.refresh.visualTimer;
  if (!vt.enabled) return null;
  if (job.status === 'idle' || job.status === 'stopped') return null;

  const { remainingMs, remainingRatio } = getCountdownProgress(job, now);
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - remainingRatio);

  const isRunning = job.status === 'running';
  const isPaused = job.status === 'paused';

  const accentColor =
    job.status === 'detected'
      ? '#10b981'
      : job.status === 'captcha_paused' || job.status === 'error_paused'
        ? '#ef4444'
        : isPaused
          ? '#f59e0b'
          : '#10b981';

  const statusText =
    isRunning || isPaused
      ? formatCountdown(remainingMs)
      : job.status === 'detected'
        ? 'MATCHED'
        : job.status === 'completed'
          ? 'DONE'
          : job.status === 'captcha_paused'
            ? 'CAPTCHA'
            : 'PAUSED';

  const countText =
    job.refresh.maxRefreshes > 0
      ? `#${job.refreshCount}/${job.refresh.maxRefreshes}`
      : `#${job.refreshCount}`;

  return (
    <div
      data-pulserefresh-ui="visual-timer"
      data-testid="visual-timer-overlay"
      role="status"
      aria-label={`PulseRefresh timer ${statusText}`}
      style={{
        position: contained ? 'absolute' : 'fixed',
        ...POSITION_STYLES[vt.position],
        opacity: vt.opacity,
        zIndex: contained ? 30 : 2147483645,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: vt.style === 'minimal' ? '6px 10px' : '8px 12px',
        borderRadius: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        color: '#f8fafc',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        boxShadow: '0 10px 28px rgba(2, 6, 23, 0.36)',
        backdropFilter: 'blur(8px)',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 12,
        lineHeight: 1.2,
        userSelect: 'none',
      }}
    >
      {vt.showProgressRing && vt.style !== 'minimal' && (
        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
          aria-hidden="true"
        >
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke="rgba(148, 163, 184, 0.2)"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 180ms linear' }}
          />
        </svg>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          data-testid="visual-timer-readout"
          style={{
            fontSize: 13,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.02em',
            color: '#ffffff',
          }}
        >
          {statusText}
        </span>
        {vt.style !== 'minimal' && (
          <span
            style={{
              fontSize: 10,
              color: '#94a3b8',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {countText} · {job.monitor.refreshType.toUpperCase()}
          </span>
        )}
      </div>

      {vt.showControls && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 2 }}>
          {(isRunning || isPaused) && (
            <button
              type="button"
              onClick={isRunning ? onPause : onResume}
              aria-label={isRunning ? 'Pause refresh' : 'Resume refresh'}
              title={isRunning ? 'Pause' : 'Resume'}
              style={{
                width: 24,
                height: 24,
                borderRadius: 9999,
                border: '1px solid rgba(148, 163, 184, 0.28)',
                background: 'rgba(30, 41, 59, 0.9)',
                color: '#e2e8f0',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isRunning ? '❚❚' : '▶'}
            </button>
          )}
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop refresh"
            title="Stop"
            style={{
              width: 24,
              height: 24,
              borderRadius: 9999,
              border: '1px solid rgba(239, 68, 68, 0.4)',
              background: 'rgba(127, 29, 29, 0.65)',
              color: '#fecaca',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ■
          </button>
        </div>
      )}
    </div>
  );
}
