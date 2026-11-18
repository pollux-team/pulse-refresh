import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { clearAllInMemorySchedules } from '@/src/lib/background-controller';
import { setBrowserOverride } from '@/src/lib/browser-api';
import { globalSleepManager } from '@/src/lib/sleep-manager';

// Polyfill ResizeObserver & window.scrollTo for jsdom
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
window.scrollTo = (() => {}) as typeof window.scrollTo;

beforeEach(() => {
  fakeBrowser.reset();
  setBrowserOverride(null);
  clearAllInMemorySchedules();
  document.body.innerHTML = '';
  document.title = '';
});

afterEach(async () => {
  clearAllInMemorySchedules();
  await globalSleepManager.release();
});
