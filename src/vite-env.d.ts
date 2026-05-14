/// <reference types="vite/client" />

import type { AppData, AppSettings, TagItem, TaskItem, TimeEntry } from './types';

declare global {
  interface Window {
    hoursTracker: {
      load: () => Promise<AppData>;
      save: (payload: AppData) => Promise<{ ok: true }>;
      generateReport: (payload: {
        settings: AppSettings;
        entries: TimeEntry[];
        tasks: TaskItem[];
        tags: TagItem[];
        dateLabel: string;
      }) => Promise<{ content: string }>;
      refineReport: (payload: {
        settings: AppSettings;
        entries: TimeEntry[];
        tasks: TaskItem[];
        tags: TagItem[];
        dateLabel: string;
        currentReport: string;
        feedback: string;
      }) => Promise<{ content: string }>;
      writeClipboard: (payload: { text: string; html?: string }) => Promise<{ ok: true }>;
      getAppVersion: () => Promise<string>;
    };
  }
}

export {};
