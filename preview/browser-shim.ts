import { handleRuntimeMessage } from '@/src/lib/background-controller';
import { type BrowserLike, setBrowserOverride } from '@/src/lib/browser-api';

type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

export interface PreviewEventBus {
  notifications: Array<{ id: string; title: string; message: string; at: number }>;
  reloads: number;
  pickerRequested: number;
  subscribe: (fn: () => void) => () => void;
}

/**
 * Installs a persistent localStorage-backed WebExtension API shim so the
 * real PopupApp, OptionsApp, VisualTimerOverlay, and background-controller run
 * interactively inside the live Vite preview workbench.
 */
export function installPreviewBrowserShim(): PreviewEventBus {
  const changeListeners = new Set<ChangeListener>();
  const busListeners = new Set<() => void>();

  const bus: PreviewEventBus = {
    notifications: [],
    reloads: 0,
    pickerRequested: 0,
    subscribe(fn) {
      busListeners.add(fn);
      return () => busListeners.delete(fn);
    },
  };

  const notifyBus = () => busListeners.forEach((fn) => fn());

  function createStorageArea(prefix: string, areaName: 'local' | 'sync') {
    const readAll = (): Record<string, unknown> => {
      try {
        const raw = localStorage.getItem(prefix);
        return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    };
    const writeAll = (obj: Record<string, unknown>) => {
      try {
        localStorage.setItem(prefix, JSON.stringify(obj));
      } catch {
        // Ignore storage quota errors
      }
    };

    return {
      async get(keys?: string | string[] | Record<string, unknown> | null) {
        const data = readAll();
        if (!keys) return { ...data };
        if (typeof keys === 'string') {
          return keys in data ? { [keys]: data[keys] } : {};
        }
        if (Array.isArray(keys)) {
          const out: Record<string, unknown> = {};
          for (const k of keys) {
            if (k in data) out[k] = data[k];
          }
          return out;
        }
        return { ...keys, ...data };
      },
      async set(items: Record<string, unknown>) {
        const prev = readAll();
        const next = { ...prev, ...items };
        writeAll(next);
        const diff: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
        for (const [k, v] of Object.entries(items)) {
          diff[k] = { oldValue: prev[k], newValue: v };
        }
        changeListeners.forEach((fn) => fn(diff, areaName));
      },
      async remove(keys: string | string[]) {
        const prev = readAll();
        const next = { ...prev };
        const arr = Array.isArray(keys) ? keys : [keys];
        const diff: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
        for (const k of arr) {
          if (k in next) {
            diff[k] = { oldValue: next[k], newValue: undefined };
            delete next[k];
          }
        }
        writeAll(next);
        changeListeners.forEach((fn) => fn(diff, areaName));
      },
      async clear() {
        writeAll({});
        changeListeners.forEach((fn) => fn({}, areaName));
      },
    };
  }

  let cookieJar: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
  }> = [
    {
      name: 'store_session',
      value: 'sess_live_9821',
      domain: 'store.nordicgear.com',
      path: '/',
      secure: true,
      httpOnly: false,
    },
    {
      name: 'region_currency',
      value: 'USD',
      domain: 'store.nordicgear.com',
      path: '/',
      secure: true,
      httpOnly: false,
    },
  ];

  const ACTIVE_PAGE_URL = 'https://store.nordicgear.com/products/rtx-5080-founders';
  const ACTIVE_PAGE_TITLE = 'GeForce RTX 5080 Founders Edition — NordicGear';

  const shim = {
    runtime: {
      id: 'pulserefresh-extension',
      getURL: (p: string) => p,
      async sendMessage(msg: unknown) {
        const typed = msg as { type?: string };
        if (typed?.type === 'START_ELEMENT_PICKER') {
          bus.pickerRequested++;
          notifyBus();
          return { ok: true };
        }
        return handleRuntimeMessage(msg as never, {
          tab: {
            id: 1,
            windowId: 1,
            url: ACTIVE_PAGE_URL,
            title: ACTIVE_PAGE_TITLE,
          },
        });
      },
      onMessage: {
        addListener() {},
        removeListener() {},
      },
    },
    storage: {
      local: createStorageArea('pr_preview_local', 'local'),
      sync: createStorageArea('pr_preview_sync', 'sync'),
      onChanged: {
        addListener(fn: ChangeListener) {
          changeListeners.add(fn);
        },
        removeListener(fn: ChangeListener) {
          changeListeners.delete(fn);
        },
      },
    },
    tabs: {
      async query() {
        return [
          {
            id: 1,
            windowId: 1,
            active: true,
            url: ACTIVE_PAGE_URL,
            title: ACTIVE_PAGE_TITLE,
          },
        ];
      },
      async get(tabId: number) {
        return {
          id: tabId,
          windowId: 1,
          url: ACTIVE_PAGE_URL,
          title: ACTIVE_PAGE_TITLE,
        };
      },
      async reload() {
        bus.reloads++;
        notifyBus();
      },
      async update(_tabId: number, props: { url?: string }) {
        if (props.url) {
          bus.reloads++;
          notifyBus();
        }
        return {};
      },
      async sendMessage(_tabId: number, msg: { type?: string }) {
        if (msg?.type === 'EXECUTE_XHR_REFRESH') {
          bus.reloads++;
          notifyBus();
        }
        return { ok: true };
      },
      onUpdated: { addListener() {} },
      onRemoved: { addListener() {} },
    },
    windows: {
      async update() {
        return {};
      },
    },
    alarms: {
      async create() {},
      async clear() {
        return true;
      },
      onAlarm: { addListener() {} },
    },
    notifications: {
      async create(id: string, opts: { title?: string; message?: string }) {
        bus.notifications = [
          {
            id,
            title: opts.title || 'PulseRefresh Alert',
            message: opts.message || '',
            at: Date.now(),
          },
          ...bus.notifications,
        ].slice(0, 5);
        notifyBus();
        return id;
      },
      onClicked: { addListener() {} },
    },
    cookies: {
      async getAll() {
        return [...cookieJar];
      },
      async remove({ name }: { name: string }) {
        cookieJar = cookieJar.filter((c) => c.name !== name);
        return { name };
      },
      async set(c: { name: string; value: string; path?: string }) {
        cookieJar = cookieJar.filter((x) => x.name !== c.name);
        cookieJar.push({
          name: c.name,
          value: c.value,
          domain: 'store.nordicgear.com',
          path: c.path || '/',
          secure: true,
          httpOnly: false,
        });
        return c;
      },
    },
    action: {
      async setBadgeText() {},
      async setBadgeBackgroundColor() {},
    },
    power: {
      requestKeepAwake() {},
      releaseKeepAwake() {},
    },
    commands: {
      onCommand: { addListener() {} },
    },
  };

  setBrowserOverride(shim as unknown as BrowserLike);
  return bus;
}
