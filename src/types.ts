export type SidebarView = 'time' | 'summary' | 'tasks' | 'tags' | 'reports' | 'analytics' | 'settings';

export type TaskItem = {
  id: string;
  name: string;
  color: string;
  excludeFromSummary?: boolean;
};

export type TagItem = {
  id: string;
  name: string;
};

export type TimeEntry = {
  id: string;
  project: string;
  details: string;
  taskId: string;
  tagIds: string[];
  start: string;
  end: string;
};

export type AppSettings = {
  providerType: string;
  providerName: string;
  endpoint: string;
  model: string;
  apiKey: string;
  defaultTaskId: string;
  reportPrompt: string;
};

export type AppData = {
  entries: TimeEntry[];
  tasks: TaskItem[];
  tags: TagItem[];
  settings: AppSettings;
};
