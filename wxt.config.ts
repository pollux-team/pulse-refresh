import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    excludeSources: [
      'Unselected files/**',
      'store-listing/**',
      'releases/**',
      'preview/**',
      'vite.preview.config.ts',
      'TODO.md',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
  }),
  manifest: ({ browser }) => {
    const basePermissions = [
      'storage',
      'tabs',
      'alarms',
      'notifications',
      'cookies',
      'scripting',
      'activeTab',
    ];
    if (browser !== 'firefox') {
      basePermissions.push('power');
    }

    return {
      name: 'PulseRefresh - Auto Refresh & Page Monitor',
      short_name: 'PulseRefresh',
      // 122 chars — strictly within Chrome Web Store's 132-character limit
      description:
        'Auto-refresh tabs on custom, random, or scheduled timers with silent XHR reload, page change alerts, webhooks, and macros.',
      version: '1.0.0',
      permissions: basePermissions,
      host_permissions: ['<all_urls>'],
      icons: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        96: 'icon/96.png',
        128: 'icon/128.png',
      },
      action: {
        default_title: 'PulseRefresh',
      },
      commands: {
        'toggle-refresh': {
          suggested_key: {
            default: 'Alt+Shift+R',
          },
          description: 'Start or stop auto-refresh on the active tab',
        },
        'stop-all-refreshes': {
          suggested_key: {
            default: 'Alt+Shift+S',
          },
          description: 'Stop all active refreshing tabs',
        },
        'pick-monitor-area': {
          suggested_key: {
            default: 'Alt+Shift+P',
          },
          description: 'Select a custom page area to monitor',
        },
        'toggle-visual-timer': {
          suggested_key: {
            default: 'Alt+Shift+V',
          },
          description: 'Toggle the on-page visual countdown timer',
        },
      },
      ...(browser === 'firefox'
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'pulserefresh@pulserefresh.app',
                strict_min_version: '109.0',
                data_collection_permissions: {
                  required: ['none'],
                },
              },
            },
          }
        : {}),
    };
  },
});
