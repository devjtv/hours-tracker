import { useEffect, useMemo, useRef, useState } from 'react';
import Select, { createFilter } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import {
  BarChart3,
  ChevronDown,
  Clock3,
  FolderKanban,
  GripVertical,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Tag,
  Trash2
} from 'lucide-react';
import type { InputActionMeta, StylesConfig } from 'react-select';
import type { AppData, SidebarView, TagItem, TaskItem, TimeEntry } from './types';

const sidebarItems: { id: SidebarView; label: string; icon: typeof Clock3 }[] = [
  { id: 'time', label: 'Time tracking', icon: Clock3 },
  { id: 'tasks', label: 'Tasks', icon: FolderKanban },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'reports', label: 'EOD report', icon: Sparkles },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings }
];

const providerPresets = {
  'openai-compatible': {
    providerName: 'OpenAI Compatible',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4.1-mini'
  },
  openrouter: {
    providerName: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4.1-mini'
  },
  custom: {
    providerName: 'Custom Provider',
    endpoint: '',
    model: ''
  }
} as const;

const emptyData: AppData = {
  entries: [],
  tasks: [],
  tags: [],
  settings: {
    providerType: 'openrouter',
    providerName: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4.1-mini',
    apiKey: '',
    defaultTaskId: 'task-none',
    reportPrompt:
      'You are generating an end-of-day work report. Group work by project. Output exactly in this structure: Date: [DD/MM/YYYY], then Tasks Worked On:, then bullet points for each project, with nested bullets for concise outcome-focused notes.'
  }
};

type EntryDraft = {
  project: string;
  details: string;
  taskId: string;
  tagIds: string[];
  start: string;
  end: string;
};

type ProjectOption = {
  value: string;
  label: string;
};

type TaskOption = {
  value: string;
  label: string;
  color: string;
};

type ProviderOption = {
  value: string;
  label: string;
};

function buildSelectStyles<Option>(): StylesConfig<Option, false> {
  return {
    control: (base, state) => ({
      ...base,
      minHeight: 40,
      borderRadius: 12,
      borderColor: state.isFocused ? '#72a7ff' : '#414348',
      boxShadow: 'none',
      backgroundColor: '#1c1d1f',
      '&:hover': {
        borderColor: state.isFocused ? '#72a7ff' : '#51545a'
      }
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '0 10px'
    }),
    input: (base) => ({
      ...base,
      color: '#f3f4f6',
      margin: 0,
      padding: 0
    }),
    singleValue: (base) => ({
      ...base,
      color: '#f3f4f6'
    }),
    placeholder: (base) => ({
      ...base,
      color: '#8d929b'
    }),
    menu: (base) => ({
      ...base,
      marginTop: 4,
      border: '1px solid #414348',
      borderRadius: 12,
      backgroundColor: '#262628',
      overflow: 'hidden',
      boxShadow: '0 18px 32px rgba(0, 0, 0, 0.34)'
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999
    }),
    option: (base, state) => ({
      ...base,
      padding: '10px 12px',
      color: '#f3f4f6',
      backgroundColor: state.isFocused ? '#34363a' : '#262628',
      cursor: 'pointer'
    }),
    menuList: (base) => ({
      ...base,
      padding: 0
    }),
    dropdownIndicator: (base) => ({
      ...base,
      color: '#cdd1d8',
      padding: 8
    }),
    clearIndicator: (base) => ({
      ...base,
      color: '#cdd1d8',
      padding: 8
    }),
    indicatorSeparator: () => ({
      display: 'none'
    })
  };
}

const projectSelectStyles: StylesConfig<ProjectOption, false> = buildSelectStyles<ProjectOption>();
const taskSelectStyles: StylesConfig<TaskOption, false> = buildSelectStyles<TaskOption>();
const providerSelectStyles: StylesConfig<ProviderOption, false> = buildSelectStyles<ProviderOption>();

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours && mins) return `${hours} h ${mins} min`;
  if (hours) return `${hours} h`;
  return `${mins} min`;
}

function entryDisplayProject(entry: TimeEntry, tasks: TaskItem[]) {
  const project = entry.project.trim();
  if (project) return project;
  const taskName = tasks.find((task) => task.id === entry.taskId)?.name;
  return taskName?.trim() || 'Untitled';
}

function entryMinutes(entry: TimeEntry) {
  return Math.max(
    0,
    Math.round((new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000)
  );
}

function dayKey(dateString: string) {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function dayHeading(dateString: string) {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(dateString));
}

function dateBracket(dateString: string) {
  return new Intl.DateTimeFormat('en-GB').format(new Date(dateString));
}

function timeLabel(dateString: string) {
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(dateString));
}

function sortEntries(entries: TimeEntry[]) {
  return [...entries].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
}

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getDatePart(dateTime: string) {
  return dateTime.split('T')[0] ?? '';
}

function getTimePart(dateTime: string) {
  return (dateTime.split('T')[1] ?? '09:00').slice(0, 5);
}

function mergeDateAndTime(date: string, time: string) {
  return `${date}T${time}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlToPlainText(html: string) {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}

function reportTextToHtml(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/^\s*</.test(trimmed)) return trimmed;

  const lines = trimmed.split(/\r?\n/);
  const html: string[] = [];
  let openTop = false;
  let openSub = false;

  const closeLists = () => {
    if (openSub) {
      html.push('</ul>');
      openSub = false;
    }
    if (openTop) {
      html.push('</ul>');
      openTop = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const topBullet = /^[-*•]\s+/.test(trimmedLine);
    const nestedBullet = /^\s{2,}[-*•]\s+/.test(rawLine);

    if (nestedBullet) {
      if (!openTop) {
        html.push('<ul>');
        openTop = true;
      }
      if (!openSub) {
        html.push('<ul>');
        openSub = true;
      }
      html.push(`<li>${escapeHtml(trimmedLine.replace(/^[-*•]\s+/, ''))}</li>`);
      continue;
    }

    if (topBullet) {
      if (!openTop) {
        html.push('<ul>');
        openTop = true;
      }
      if (openSub) {
        html.push('</ul>');
        openSub = false;
      }
      const content = trimmedLine.replace(/^[-*•]\s+/, '');
      html.push(`<li><strong>${escapeHtml(content)}</strong></li>`);
      continue;
    }

    closeLists();

    if (/^date:/i.test(trimmedLine)) {
      const value = trimmedLine.replace(/^date:\s*/i, '');
      html.push(`<p><strong>Date:</strong> ${escapeHtml(value)}</p>`);
      continue;
    }

    if (/^tasks worked on:/i.test(trimmedLine)) {
      html.push('<p><strong>Tasks Worked On:</strong></p>');
      continue;
    }

    html.push(`<p>${escapeHtml(trimmedLine)}</p>`);
  }

  closeLists();
  return html.join('');
}

function reportTextToMarkdown(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (/^\s*</.test(trimmed) && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html');
    const lines: string[] = [];
    doc.body.childNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.tagName === 'P') {
        const strong = node.querySelector('strong');
        if (strong) {
          const label = strong.textContent?.trim() ?? '';
          const tail = node.textContent?.replace(label, '').trim() ?? '';
          lines.push(tail ? `**${label}** ${tail}` : `**${label}**`);
        } else {
          lines.push(node.textContent?.trim() ?? '');
        }
      }
      if (node.tagName === 'UL') {
        node.querySelectorAll(':scope > li').forEach((li) => {
          const textOnly = Array.from(li.childNodes)
            .filter((child) => !(child instanceof HTMLUListElement))
            .map((child) => child.textContent ?? '')
            .join('')
            .trim();
          lines.push(`- ${textOnly}`);
          const nested = li.querySelector(':scope > ul');
          if (nested) {
            nested.querySelectorAll(':scope > li').forEach((sub) => {
              lines.push(`  - ${(sub.textContent ?? '').trim()}`);
            });
          }
        });
      }
    });
    return lines.filter(Boolean).join('\n');
  }

  return trimmed
    .replace(/^Date:\s*/im, '**Date:** ')
    .replace(/^Tasks Worked On:\s*$/im, '**Tasks Worked On:**');
}

function roundedNow() {
  const now = new Date();
  const rounded = new Date(now);
  rounded.setMinutes(Math.floor(now.getMinutes() / 15) * 15, 0, 0);
  return rounded;
}

function defaultDraft(tasks: TaskItem[], entries: TimeEntry[] = [], targetDay?: string): EntryDraft {
  const fallbackDay = targetDay ?? dayKey(new Date().toISOString());
  const previousEntry = [...entries]
    .filter((entry) => dayKey(entry.start) === fallbackDay)
    .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0];

  const start = previousEntry ? new Date(previousEntry.end) : roundedNow();
  const now = new Date();
  const nearestQuarter = new Date(now);
  nearestQuarter.setMinutes(Math.round(now.getMinutes() / 15) * 15, 0, 0);
  const minimumEnd = new Date(start.getTime() + 15 * 60000);
  const end = nearestQuarter.getTime() > minimumEnd.getTime() ? nearestQuarter : minimumEnd;

  return {
    project: '',
    details: '',
    taskId: tasks[0]?.id ?? 'task-none',
    tagIds: [],
    start: toLocalInputValue(start),
    end: toLocalInputValue(end)
  };
}

function getDefaultTaskId(data: AppData) {
  return data.tasks.find((task) => task.id === data.settings.defaultTaskId)?.id ?? data.tasks[0]?.id ?? 'task-none';
}

function entryToDraft(entry: TimeEntry): EntryDraft {
  return {
    project: entry.project,
    details: entry.details,
    taskId: entry.taskId,
    tagIds: entry.tagIds,
    start: toLocalInputValue(new Date(entry.start)),
    end: toLocalInputValue(new Date(entry.end))
  };
}

export default function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [view, setView] = useState<SidebarView>('time');
  const [loaded, setLoaded] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(defaultDraft([]));
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState('');
  const [reportDay, setReportDay] = useState(dayKey(new Date().toISOString()));
  const [reportText, setReportText] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportFeedback, setReportFeedback] = useState('');
  const [reportRefineBusy, setReportRefineBusy] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<string[]>([]);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskColor, setNewTaskColor] = useState('#f6a318');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState({ name: '', color: '#f6a318' });
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [taskDeleteTarget, setTaskDeleteTarget] = useState<TaskItem | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState({ name: '' });
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<{
    state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    version?: string;
    percent?: number;
    message?: string;
  }>({ state: 'idle' });
  const detailsRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    window.hoursTracker.load().then((loadedData) => {
      const latest = sortEntries(loadedData.entries)[0];
      const initialDay = latest ? dayKey(latest.start) : dayKey(new Date().toISOString());
      setData(loadedData);
      setDraft({
        ...defaultDraft(loadedData.tasks, loadedData.entries, initialDay),
        taskId: getDefaultTaskId(loadedData)
      });
      setActiveDay(initialDay);
      setReportDay(dayKey(new Date().toISOString()));
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.hoursTracker.save(data);
  }, [data, loaded]);

  useEffect(() => {
    window.hoursTracker.getAppVersion().then(setAppVersion);
    const unsubscribe = window.hoursTracker.onUpdaterEvent(({ name, payload }) => {
      if (name === 'checking') setUpdateStatus({ state: 'checking' });
      else if (name === 'available')
        setUpdateStatus({ state: 'downloading', version: payload?.version, percent: 0 });
      else if (name === 'not-available')
        setUpdateStatus({ state: 'not-available', version: payload?.version });
      else if (name === 'progress')
        setUpdateStatus((prev) => ({
          ...prev,
          state: 'downloading',
          percent: payload?.percent ?? prev.percent
        }));
      else if (name === 'downloaded')
        setUpdateStatus({ state: 'downloaded', version: payload?.version });
      else if (name === 'error')
        setUpdateStatus({ state: 'error', message: payload?.message });
    });
    return unsubscribe;
  }, []);

  async function handleCheckForUpdates() {
    setUpdateStatus({ state: 'checking' });
    const result = await window.hoursTracker.checkForUpdates();
    if (!result.ok) {
      setUpdateStatus({ state: 'error', message: result.message });
    }
  }

  useEffect(() => {
    const textarea = detailsRef.current;
    if (!textarea || !showComposer) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [draft.details, showComposer]);

  useEffect(() => {
    if (!showComposer || !editingEntryId || !draft.start || !draft.end) return;

    setData((current) => {
      const existingEntry = current.entries.find((entry) => entry.id === editingEntryId);
      if (!existingEntry) return current;

      const nextTaskId = draft.taskId || getDefaultTaskId(current);
      const nextEntry: TimeEntry = {
        ...existingEntry,
        project: draft.project.trim(),
        details: draft.details.trim(),
        taskId: nextTaskId,
        tagIds: draft.tagIds,
        start: new Date(draft.start).toISOString(),
        end: new Date(draft.end).toISOString()
      };

      const unchanged =
        existingEntry.project === nextEntry.project &&
        existingEntry.details === nextEntry.details &&
        existingEntry.taskId === nextEntry.taskId &&
        existingEntry.start === nextEntry.start &&
        existingEntry.end === nextEntry.end &&
        existingEntry.tagIds.length === nextEntry.tagIds.length &&
        existingEntry.tagIds.every((tagId, index) => tagId === nextEntry.tagIds[index]);

      if (unchanged) return current;

      return {
        ...current,
        entries: current.entries.map((entry) => (entry.id === editingEntryId ? nextEntry : entry))
      };
    });

    setActiveDay(dayKey(draft.start));
  }, [draft, editingEntryId, showComposer]);

  const taskMap = useMemo(
    () => Object.fromEntries(data.tasks.map((task) => [task.id, task])),
    [data.tasks]
  );

  const tagMap = useMemo(
    () => Object.fromEntries(data.tags.map((tag) => [tag.id, tag.name])),
    [data.tags]
  );

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { label: string; totalMinutes: number; items: TimeEntry[] }>();

    sortEntries(data.entries).forEach((entry) => {
      const key = dayKey(entry.start);
      const current = groups.get(key) ?? {
        label: dayHeading(entry.start),
        totalMinutes: 0,
        items: []
      };
      current.totalMinutes += entryMinutes(entry);
      current.items.push(entry);
      groups.set(key, current);
    });

    return [...groups.entries()];
  }, [data.entries]);

  const totalToday = useMemo(() => {
    const today = dayKey(new Date().toISOString());
    return data.entries
      .filter((entry) => dayKey(entry.start) === today)
      .reduce((sum, entry) => sum + entryMinutes(entry), 0);
  }, [data.entries]);

  const projectOptions = useMemo<ProjectOption[]>(() => {
    const projectSet = new Set(sortEntries(data.entries).map((entry) => entry.project).filter(Boolean));
    return [...projectSet].map((project) => ({
      value: project,
      label: project
    }));
  }, [data.entries]);

  const taskOptions = useMemo<TaskOption[]>(
    () =>
      data.tasks.map((task) => ({
        value: task.id,
        label: task.name,
        color: task.color
      })),
    [data.tasks]
  );

  const providerOptions = useMemo<ProviderOption[]>(
    () => [
      { value: 'openrouter', label: 'OpenRouter' },
      { value: 'openai-compatible', label: 'OpenAI compatible' },
      { value: 'custom', label: 'Custom' }
    ],
    []
  );

  const activeEntries = useMemo(
    () => data.entries.filter((entry) => dayKey(entry.start) === activeDay),
    [activeDay, data.entries]
  );

  const activeDateLabel =
    groupedEntries.find(([key]) => key === activeDay)?.[1].label ??
    dayHeading(new Date().toISOString());

  const summaryByProject = useMemo(() => {
    const grouped = new Map<string, TimeEntry[]>();
    activeEntries.forEach((entry) => {
      const label = entryDisplayProject(entry, data.tasks);
      const bucket = grouped.get(label) ?? [];
      bucket.push(entry);
      grouped.set(label, bucket);
    });
    return [...grouped.entries()];
  }, [activeEntries, data.tasks]);

  const reportEntries = useMemo(
    () => data.entries.filter((entry) => dayKey(entry.start) === reportDay),
    [data.entries, reportDay]
  );

  const reportDateLabel = dayHeading(`${reportDay}T00:00:00`);

  function updateSetting<K extends keyof AppData['settings']>(key: K, value: AppData['settings'][K]) {
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [key]: value
      }
    }));
  }

  function handleProviderPresetChange(providerType: string) {
    const preset =
      providerPresets[providerType as keyof typeof providerPresets] ?? providerPresets.custom;

    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        providerType,
        providerName: preset.providerName,
        endpoint: preset.endpoint,
        model: preset.model
      }
    }));
  }

  function openNewEntry() {
    setEditingEntryId(null);
    setCollapsedDays((current) => current.filter((day) => day !== activeDay));
    setDraft({
      ...defaultDraft(data.tasks, data.entries, activeDay),
      taskId: getDefaultTaskId(data)
    });
    setShowComposer(true);
  }

  function openEditEntry(entry: TimeEntry) {
    setEditingEntryId(entry.id);
    setCollapsedDays((current) => current.filter((day) => day !== dayKey(entry.start)));
    setDraft(entryToDraft(entry));
    setShowComposer(true);
  }

  function updateDraftProject(project: string) {
    setDraft((current) => ({ ...current, project }));
  }

  function closeComposer() {
    setShowComposer(false);
    setEditingEntryId(null);
    setDraft({
      ...defaultDraft(data.tasks, data.entries, activeDay),
      taskId: getDefaultTaskId(data)
    });
  }

  function handleProjectInputChange(inputValue: string, meta: InputActionMeta) {
    if (meta.action === 'input-change') {
      updateDraftProject(inputValue);
    }
  }

  function renderTaskOptionLabel(option: TaskOption) {
    return (
      <span className="select-option-label">
        <span className="color-dot" style={{ backgroundColor: option.color }} />
        <span>{option.label}</span>
      </span>
    );
  }

  function toggleDayGroup(groupKey: string) {
    setCollapsedDays((current) =>
      current.includes(groupKey)
        ? current.filter((day) => day !== groupKey)
        : [...current, groupKey]
    );
    setActiveDay(groupKey);
  }

  function saveEntry() {
    if (!draft.start || !draft.end) return;

    const nextTaskId = draft.taskId || getDefaultTaskId(data);

    setData((current) => {
      const nextEntry: TimeEntry = {
        id: editingEntryId ?? uid('entry'),
        project: draft.project.trim(),
        details: draft.details.trim(),
        taskId: nextTaskId,
        tagIds: draft.tagIds,
        start: new Date(draft.start).toISOString(),
        end: new Date(draft.end).toISOString()
      };

      return {
        ...current,
        entries: editingEntryId
          ? current.entries.map((entry) => (entry.id === editingEntryId ? nextEntry : entry))
          : [nextEntry, ...current.entries]
      };
    });

    setActiveDay(dayKey(draft.start));
    setCollapsedDays((current) => current.filter((day) => day !== dayKey(draft.start)));
    setDraft({
      ...defaultDraft(data.tasks, data.entries, dayKey(draft.start)),
      taskId: getDefaultTaskId(data)
    });
    setEditingEntryId(null);
    setShowComposer(false);
  }

  function deleteEntry() {
    if (!editingEntryId) return;

    setData((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== editingEntryId)
    }));

    setEditingEntryId(null);
    setDraft({
      ...defaultDraft(data.tasks, data.entries, activeDay),
      taskId: getDefaultTaskId(data)
    });
    setShowComposer(false);
  }

  function addTask() {
    if (!newTaskName.trim()) return;

    const nextTask = { id: uid('task'), name: newTaskName.trim(), color: newTaskColor };
    setData((current) => ({
      ...current,
      tasks: [...current.tasks, nextTask],
      settings: current.tasks.length === 0
        ? { ...current.settings, defaultTaskId: nextTask.id }
        : current.settings
    }));
    setNewTaskName('');
  }

  function startTaskEdit(task: TaskItem) {
    setEditingTaskId(task.id);
    setTaskDraft({ name: task.name, color: task.color });
  }

  function saveTaskEdit() {
    if (!editingTaskId || !taskDraft.name.trim()) return;

    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === editingTaskId
          ? { ...task, name: taskDraft.name.trim(), color: taskDraft.color }
          : task
      )
    }));

    setEditingTaskId(null);
  }

  function deleteTask(taskId: string) {
    const fallbackTaskId = data.tasks.find((task) => task.id !== taskId)?.id ?? 'task-none';

    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
      settings: {
        ...current.settings,
        defaultTaskId:
          current.settings.defaultTaskId === taskId ? fallbackTaskId : current.settings.defaultTaskId
      },
      entries: current.entries.map((entry) =>
        entry.taskId === taskId ? { ...entry, taskId: fallbackTaskId } : entry
      )
    }));

    if (draft.taskId === taskId) {
      setDraft((current) => ({ ...current, taskId: fallbackTaskId }));
    }

    if (editingTaskId === taskId) {
      setEditingTaskId(null);
    }

    setTaskDeleteTarget(null);
  }

  function confirmDeleteTask(task: TaskItem) {
    setTaskDeleteTarget(task);
  }

  function setDefaultTask(taskId: string) {
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        defaultTaskId: taskId
      }
    }));
  }

  function moveTask(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    setData((current) => {
      const nextTasks = [...current.tasks];
      const fromIndex = nextTasks.findIndex((task) => task.id === draggedId);
      const toIndex = nextTasks.findIndex((task) => task.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return current;
      const [moved] = nextTasks.splice(fromIndex, 1);
      nextTasks.splice(toIndex, 0, moved);
      return { ...current, tasks: nextTasks };
    });
  }

  function addTag() {
    if (!newTagName.trim()) return;

    setData((current) => ({
      ...current,
      tags: [...current.tags, { id: uid('tag'), name: newTagName.trim() }]
    }));

    setNewTagName('');
  }

  function startTagEdit(tag: TagItem) {
    setEditingTagId(tag.id);
    setTagDraft({ name: tag.name });
  }

  function saveTagEdit() {
    if (!editingTagId || !tagDraft.name.trim()) return;

    setData((current) => ({
      ...current,
      tags: current.tags.map((tag) =>
        tag.id === editingTagId ? { ...tag, name: tagDraft.name.trim() } : tag
      )
    }));

    setEditingTagId(null);
  }

  function deleteTag(tagId: string) {
    setData((current) => ({
      ...current,
      tags: current.tags.filter((tag) => tag.id !== tagId),
      entries: current.entries.map((entry) => ({
        ...entry,
        tagIds: entry.tagIds.filter((id) => id !== tagId)
      }))
    }));

    setDraft((current) => ({
      ...current,
      tagIds: current.tagIds.filter((id) => id !== tagId)
    }));

    if (editingTagId === tagId) {
      setEditingTagId(null);
    }
  }

  async function generateReport(targetDay: string = reportDay) {
    const dayEntries = data.entries.filter((entry) => dayKey(entry.start) === targetDay);

    if (dayEntries.length === 0) {
      setReportError('No entries for the selected day.');
      return;
    }

    setReportBusy(true);
    setReportError('');

    try {
      const result = await window.hoursTracker.generateReport({
        settings: data.settings,
        entries: dayEntries.map((entry) => ({
          ...entry,
          project: entryDisplayProject(entry, data.tasks)
        })),
        tasks: data.tasks,
        tags: data.tags,
        dateLabel: dateBracket(dayEntries[0]?.start ?? new Date().toISOString())
      });
      setReportText(result.content);
      setReportFeedback('');
      setView('reports');
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Failed to generate report.');
    } finally {
      setReportBusy(false);
    }
  }

  async function refineReport() {
    const dayEntries = data.entries.filter((entry) => dayKey(entry.start) === reportDay);

    if (!reportText.trim()) {
      setReportError('Generate a report first.');
      return;
    }

    if (!reportFeedback.trim()) {
      setReportError('Add feedback for the revision.');
      return;
    }

    setReportRefineBusy(true);
    setReportError('');

    try {
      const result = await window.hoursTracker.refineReport({
        settings: data.settings,
        entries: dayEntries.map((entry) => ({
          ...entry,
          project: entryDisplayProject(entry, data.tasks)
        })),
        tasks: data.tasks,
        tags: data.tags,
        dateLabel: dateBracket(dayEntries[0]?.start ?? `${reportDay}T00:00:00`),
        currentReport: reportText,
        feedback: reportFeedback
      });
      setReportText(result.content);
      setReportFeedback('');
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Failed to refine report.');
    } finally {
      setReportRefineBusy(false);
    }
  }

  async function copyReport(format: 'rich' | 'html' | 'markdown') {
    if (!reportText.trim()) return;
    const html = reportTextToHtml(reportText);
    const markdown = reportTextToMarkdown(reportText);
    const plain = /^\s*</.test(reportText.trim()) ? htmlToPlainText(reportText) : reportText;

    if (format === 'rich') {
      await window.hoursTracker.writeClipboard({ text: plain, html });
      setCopyStatus('Copied rich text');
      return;
    }

    if (format === 'html') {
      await window.hoursTracker.writeClipboard({ text: html });
      setCopyStatus('Copied HTML');
      return;
    }

    await window.hoursTracker.writeClipboard({ text: markdown });
    setCopyStatus('Copied markdown');
  }

  if (!loaded) {
    return <div className="loading-shell">Loading hours tracker…</div>;
  }

  const hasEntries = groupedEntries.length > 0;
  const hasTags = data.tags.length > 0;

  function renderMainContent() {
    if (view === 'time') {
      return (
        <div className="timeline-panel">
          {hasEntries ? (
            groupedEntries.map(([groupKey, group]) => (
              <section
                key={groupKey}
                className={collapsedDays.includes(groupKey) ? 'day-group collapsed' : 'day-group'}
              >
                <button className="day-header" onClick={() => toggleDayGroup(groupKey)}>
                  <span className="day-header-label">
                    <ChevronDown size={16} className="day-toggle-icon" />
                    <span>{group.label}</span>
                  </span>
                  <strong>{formatMinutes(group.totalMinutes)}</strong>
                </button>
                <div className="entry-list">
                  {group.items.map((entry) => {
                    const task = taskMap[entry.taskId];
                    return (
                      <button
                        key={entry.id}
                        className={activeDay === groupKey ? 'entry-card active' : 'entry-card'}
                        onClick={() => {
                          setActiveDay(groupKey);
                          openEditEntry(entry);
                        }}
                      >
                        <span
                          className="entry-accent"
                          style={{ backgroundColor: task?.color ?? '#666' }}
                        />
                        <div className="entry-main">
                          <div className="entry-title-row">
                            <h3>{entryDisplayProject(entry, data.tasks)}</h3>
                            <strong>{formatMinutes(entryMinutes(entry))}</strong>
                          </div>
                          {entry.project.trim() || entry.details ? (
                            <p>
                              {entry.project.trim() ? (task?.name ?? 'Without task') : ''}
                              {entry.project.trim() && entry.details ? ' • ' : ''}
                              {entry.details}
                            </p>
                          ) : null}
                          {entry.tagIds.length > 0 ? (
                            <div className="tag-row">
                              {entry.tagIds.map((tagId) => (
                                <span key={tagId} className="tag-chip">
                                  {tagMap[tagId] ?? tagId}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="empty-state">
              <p className="eyebrow">No entries yet</p>
              <h2>Add your first entry</h2>
              <button className="save-button" onClick={openNewEntry}>
                <Plus size={16} />
                Add entry
              </button>
            </div>
          )}
        </div>
      );
    }

    if (view === 'reports') {
      return (
        <section className="main-view-card">
          <div className="view-header">
            <div>
              <p className="eyebrow">EOD Report</p>
              <h2>{reportDateLabel}</h2>
            </div>
          </div>
          <div className="page-controls">
            <label className="control-field">
              <span>Day</span>
              <input
                type="date"
                value={reportDay}
                onChange={(event) => setReportDay(event.target.value)}
              />
            </label>
            <button className="save-button" onClick={() => generateReport(reportDay)} disabled={reportBusy}>
              <Sparkles size={16} />
              {reportBusy ? 'Generating…' : 'Generate report'}
            </button>
          </div>
          <div className="copy-actions">
            <button className="ghost-button" onClick={() => copyReport('rich')} disabled={!reportText.trim()}>
              Copy Rich Text
            </button>
            <button className="ghost-button" onClick={() => copyReport('html')} disabled={!reportText.trim()}>
              Copy HTML
            </button>
            <button className="ghost-button" onClick={() => copyReport('markdown')} disabled={!reportText.trim()}>
              Copy Markdown
            </button>
            {copyStatus ? <span className="copy-status">{copyStatus}</span> : null}
          </div>
          <textarea
            className="report-output main-report-output"
            value={reportText}
            onChange={(event) => setReportText(event.target.value)}
            placeholder="Generate a report for the selected day."
          />
          <div className="report-feedback-card">
            <label className="full-width">
              <span>Follow-up feedback</span>
              <textarea
                className="report-feedback-input"
                value={reportFeedback}
                onChange={(event) => setReportFeedback(event.target.value)}
                placeholder="Example: make it shorter, combine duplicate notes, keep bold headings, sound more client-friendly."
              />
            </label>
            <button
              className="save-button"
              onClick={refineReport}
              disabled={reportRefineBusy || !reportText.trim()}
            >
              {reportRefineBusy ? 'Updating…' : 'Apply feedback'}
            </button>
          </div>
          {reportError ? <p className="error-text">{reportError}</p> : null}
        </section>
      );
    }

    if (view === 'tasks') {
      return (
        <section className="main-view-card">
          <div className="view-header">
            <div>
              <p className="eyebrow">Tasks</p>
              <h2>Manage task types</h2>
            </div>
          </div>
          <p className="view-copy">Drag to reorder. Mark one task as the default for new time entries.</p>
          <div className="page-stack">
            <div className="inline-form task-form">
              <input
                value={newTaskName}
                onChange={(event) => setNewTaskName(event.target.value)}
                placeholder="Create new task"
              />
              <input
                type="color"
                value={newTaskColor}
                onChange={(event) => setNewTaskColor(event.target.value)}
                className="color-input"
              />
              <button className="save-button" onClick={addTask}>
                Add
              </button>
            </div>

            <div className="stack-list">
              {data.tasks.map((task) => {
                const isEditing = editingTaskId === task.id;
                const isDefault = data.settings.defaultTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className={dragTaskId === task.id ? 'editable-row dragging' : 'editable-row'}
                    draggable={!isEditing}
                    onDragStart={() => setDragTaskId(task.id)}
                    onDragEnd={() => setDragTaskId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragTaskId) moveTask(dragTaskId, task.id);
                      setDragTaskId(null);
                    }}
                  >
                    {isEditing ? (
                      <div className="editable-form task-form">
                        <input
                          value={taskDraft.name}
                          onChange={(event) =>
                            setTaskDraft((current) => ({ ...current, name: event.target.value }))
                          }
                        />
                        <input
                          type="color"
                          value={taskDraft.color}
                          onChange={(event) =>
                            setTaskDraft((current) => ({ ...current, color: event.target.value }))
                          }
                          className="color-input"
                        />
                        <button className="save-button" onClick={saveTaskEdit}>
                          Save
                        </button>
                      </div>
                    ) : (
                      <button className="list-item button-row" onClick={() => startTaskEdit(task)}>
                        <span className="row-label">
                          <span className="drag-handle">
                            <GripVertical size={14} />
                          </span>
                          <span className="color-dot" style={{ backgroundColor: task.color }} />
                          <span>{task.name}</span>
                          {isDefault ? <span className="default-pill">Default</span> : null}
                        </span>
                        <span className="row-actions">
                          {!isDefault ? (
                            <span
                              className="default-toggle"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDefaultTask(task.id);
                              }}
                            >
                              Set as Default
                            </span>
                          ) : null}
                          <Pencil size={14} />
                          {data.tasks.length > 1 ? (
                              <span
                                className="row-icon danger"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  confirmDeleteTask(task);
                                }}
                              >
                                <Trash2 size={14} />
                            </span>
                          ) : null}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      );
    }

    if (view === 'tags') {
      return (
        <section className="main-view-card">
          <div className="view-header">
            <div>
              <p className="eyebrow">Tags</p>
              <h2>Organise work with tags</h2>
            </div>
          </div>
          <p className="view-copy">Create tags here. They will only show on entries once used.</p>
          <div className="page-stack">
            <div className="inline-form single-grow">
              <input
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="Create new tag"
              />
              <button className="save-button" onClick={addTag}>
                Add
              </button>
            </div>

            <div className="stack-list">
              {data.tags.map((tag) => {
                const isEditing = editingTagId === tag.id;

                return (
                  <div key={tag.id} className="editable-row">
                    {isEditing ? (
                      <div className="editable-form single-grow">
                        <input
                          value={tagDraft.name}
                          onChange={(event) => setTagDraft({ name: event.target.value })}
                        />
                        <button className="save-button" onClick={saveTagEdit}>
                          Save
                        </button>
                      </div>
                    ) : (
                      <button className="list-item button-row" onClick={() => startTagEdit(tag)}>
                        <span className="row-label">
                          <Tag size={13} />
                          <span>{tag.name}</span>
                        </span>
                        <span className="row-actions">
                          <Pencil size={14} />
                          <span
                            className="row-icon danger"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteTag(tag.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      );
    }

    if (view === 'analytics') {
      return (
        <section className="main-view-card">
          <div className="view-header">
            <div>
              <p className="eyebrow">Analytics</p>
              <h2>Task totals</h2>
            </div>
          </div>
          <div className="stats-grid">
            {data.tasks.map((task) => {
              const minutes = data.entries
                .filter((entry) => entry.taskId === task.id)
                .reduce((sum, entry) => sum + entryMinutes(entry), 0);

              return (
                <div key={task.id} className="stat-box">
                  <span className="color-dot" style={{ backgroundColor: task.color }} />
                  <strong>{task.name}</strong>
                  <span>{formatMinutes(minutes)}</span>
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    return (
        <section className="main-view-card">
          <div className="view-header">
            <div>
              <p className="eyebrow">Settings</p>
              <h2>Provider configuration</h2>
            </div>
          </div>
          <div className="page-stack settings-grid settings-page">
            <label>
              <span>Provider preset</span>
              <Select<ProviderOption, false>
                className="project-select"
                styles={providerSelectStyles}
                menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                options={providerOptions}
                value={
                  providerOptions.find((option) => option.value === data.settings.providerType) ?? null
                }
                onChange={(option) => handleProviderPresetChange(option?.value ?? 'custom')}
                filterOption={createFilter({ matchFrom: 'start' })}
                noOptionsMessage={() => null}
              />
            </label>
            <label>
              <span>Provider name</span>
              <input
                value={data.settings.providerName}
                onChange={(event) => updateSetting('providerName', event.target.value)}
              />
            </label>
            <label>
              <span>Endpoint URL</span>
              <input
                value={data.settings.endpoint}
                onChange={(event) => updateSetting('endpoint', event.target.value)}
                placeholder="https://openrouter.ai/api/v1/chat/completions"
              />
            </label>
            <label>
              <span>Model</span>
              <input
                value={data.settings.model}
                onChange={(event) => updateSetting('model', event.target.value)}
              />
            </label>
            <label>
              <span>API key</span>
              <input
                type="password"
                value={data.settings.apiKey}
                onChange={(event) => updateSetting('apiKey', event.target.value)}
              />
            </label>
            <label className="full-width">
              <span>Report prompt template</span>
              <textarea
                value={data.settings.reportPrompt}
                onChange={(event) => updateSetting('reportPrompt', event.target.value)}
              />
            </label>
          </div>
          <div className="about-card">
            <div className="about-row">
              <div>
                <p className="eyebrow">About</p>
                <h3>Hours Tracker {appVersion ? `v${appVersion}` : ''}</h3>
              </div>
              <button
                className="ghost-button"
                onClick={handleCheckForUpdates}
                disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
              >
                {updateStatus.state === 'checking'
                  ? 'Checking…'
                  : updateStatus.state === 'downloading'
                    ? `Downloading ${Math.round(updateStatus.percent ?? 0)}%`
                    : updateStatus.state === 'downloaded'
                      ? 'Restart to install'
                      : 'Check for updates'}
              </button>
            </div>
            <p className="about-status">
              {updateStatus.state === 'idle' && 'Updates are checked automatically on launch.'}
              {updateStatus.state === 'checking' && 'Checking GitHub for a newer release…'}
              {updateStatus.state === 'not-available' && "You're on the latest version."}
              {updateStatus.state === 'downloading' &&
                `Downloading v${updateStatus.version ?? ''} in the background…`}
              {updateStatus.state === 'downloaded' &&
                `v${updateStatus.version ?? ''} is ready — restart to install.`}
              {updateStatus.state === 'error' &&
                `Update check failed: ${updateStatus.message ?? 'unknown error'}`}
            </p>
            {updateStatus.state === 'downloaded' ? (
              <button className="save-button" onClick={() => window.hoursTracker.quitAndInstall()}>
                Restart and install
              </button>
            ) : null}
          </div>
        </section>
      );
    }

  function renderRightPanel() {
    if (view === 'time') {
      return (
        <div className="panel-card sticky">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Selected day</p>
              <h2>{activeDateLabel}</h2>
            </div>
          </div>

          <div className="summary-stack">
            {summaryByProject.length > 0 ? (
              summaryByProject.map(([project, entries]) => (
                <div key={project} className="summary-item">
                  <strong>{project}</strong>
                  <span>{formatMinutes(entries.reduce((sum, item) => sum + entryMinutes(item), 0))}</span>
                </div>
              ))
            ) : (
              <div className="summary-item empty">
                <strong>No work logged</strong>
                <span>0 min</span>
              </div>
            )}
          </div>

          {reportError ? <p className="error-text">{reportError}</p> : null}
        </div>
      );
    }

    if (view === 'reports') {
      return (
        <div className="panel-card sticky">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Report controls</p>
              <h2>{reportDateLabel}</h2>
            </div>
          </div>
          <div className="settings-grid">
            <label>
              <span>Day</span>
              <input
                type="date"
                value={reportDay}
                onChange={(event) => setReportDay(event.target.value)}
              />
            </label>
            <button className="save-button" onClick={() => generateReport(reportDay)} disabled={reportBusy}>
              <Sparkles size={16} />
              {reportBusy ? 'Generating…' : 'Generate report'}
            </button>
          </div>
          <div className="summary-stack">
            {reportEntries.length > 0 ? (
              reportEntries.map((entry) => (
                <div key={entry.id} className="summary-item">
                  <strong>{entry.project}</strong>
                  <span>{formatMinutes(entryMinutes(entry))}</span>
                </div>
              ))
            ) : (
              <div className="summary-item empty">
                <strong>No entries for this day</strong>
                <span>0 min</span>
              </div>
            )}
          </div>
          {reportError ? <p className="error-text">{reportError}</p> : null}
        </div>
      );
    }

    return null;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Hours Tracker</div>
        <nav className="sidebar-nav">
          <button className="sidebar-link sidebar-link-add" onClick={openNewEntry} aria-label="Add entry">
            <Plus size={18} />
            <span>Add entry</span>
          </button>
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? 'sidebar-link active' : 'sidebar-link'}
                onClick={() => setView(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-actions">
            <button className="play-button" onClick={openNewEntry}>
              <Plus size={18} />
            </button>
          </div>
          <div className="topbar-stats">
            <span>Today</span>
            <strong>{formatMinutes(totalToday)}</strong>
          </div>
        </header>

        <section className="content-grid single-panel">
          {renderMainContent()}
        </section>
      </main>

      {showComposer ? (
        <div
          className="composer-backdrop"
          onClick={closeComposer}
        >
          <div className="composer-card" onClick={(event) => event.stopPropagation()}>
            <div className="composer-fields">
              <label>
                <span>Project</span>
                <CreatableSelect<ProjectOption, false>
                  unstyled={false}
                  className="project-select"
                  styles={projectSelectStyles}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                  placeholder="Search or type a project"
                  formatCreateLabel={(inputValue) => `Use "${inputValue}"`}
                  options={projectOptions}
                  value={draft.project ? { value: draft.project, label: draft.project } : null}
                  inputValue={draft.project}
                  onInputChange={handleProjectInputChange}
                  onChange={(option) => updateDraftProject(option?.value ?? '')}
                  onCreateOption={updateDraftProject}
                  filterOption={createFilter({ matchFrom: 'start' })}
                  noOptionsMessage={() => null}
                  isClearable
                />
              </label>

              <label>
                <span>Details</span>
                <textarea
                  ref={detailsRef}
                  rows={2}
                  value={draft.details}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, details: event.target.value }))
                  }
                  placeholder="Short note"
                />
              </label>

              <label>
                <span>Task</span>
                <Select<TaskOption, false>
                  className="project-select"
                  styles={taskSelectStyles}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                  options={taskOptions}
                  value={taskOptions.find((option) => option.value === draft.taskId) ?? null}
                  onChange={(option) =>
                    setDraft((current) => ({ ...current, taskId: option?.value ?? getDefaultTaskId(data) }))
                  }
                  formatOptionLabel={renderTaskOptionLabel}
                  filterOption={createFilter({ matchFrom: 'start' })}
                  noOptionsMessage={() => null}
                />
              </label>

              <div className="datetime-grid single-date">
                <label>
                  <span>Day</span>
                  <input
                    type="date"
                    value={getDatePart(draft.start)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        start: mergeDateAndTime(event.target.value, getTimePart(current.start)),
                        end: mergeDateAndTime(event.target.value, getTimePart(current.end))
                      }))
                    }
                  />
                </label>
              </div>

              <div className="datetime-grid three-up">
                <label>
                  <span>Start time</span>
                  <input
                    type="time"
                    value={getTimePart(draft.start)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        start: mergeDateAndTime(getDatePart(current.start), event.target.value)
                      }))
                    }
                  />
                </label>
                <label>
                  <span>End time</span>
                  <input
                    type="time"
                    value={getTimePart(draft.end)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        end: mergeDateAndTime(getDatePart(current.end), event.target.value)
                      }))
                    }
                  />
                </label>
              </div>

              <div className="time-meta">
                <div className="time-meta-row">
                  <span>Day</span>
                  <strong>{dateBracket(draft.start)}</strong>
                </div>
                <div className="time-meta-row">
                  <span>Start of work</span>
                  <strong>{timeLabel(draft.start)}</strong>
                </div>
                <div className="time-meta-row">
                  <span>End of work</span>
                  <strong>{timeLabel(draft.end)}</strong>
                </div>
                <div className="time-meta-row">
                  <span>Working time</span>
                  <strong>
                    {formatMinutes(
                      Math.max(
                        0,
                        Math.round(
                          (new Date(draft.end).getTime() - new Date(draft.start).getTime()) / 60000
                        )
                      )
                    )}
                  </strong>
                </div>
              </div>

              {hasTags ? (
                <label>
                  <span>Tags</span>
                  <div className="tag-picker">
                    {data.tags.map((tag) => {
                      const active = draft.tagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          className={active ? 'tag-chip active' : 'tag-chip'}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              tagIds: active
                                ? current.tagIds.filter((tagId) => tagId !== tag.id)
                                : [...current.tagIds, tag.id]
                            }))
                          }
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </label>
              ) : null}
            </div>

            <div className="composer-footer split">
              <div>
                {editingEntryId ? (
                  <button className="danger-button" onClick={deleteEntry}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                ) : null}
              </div>
              <div className="composer-actions">
                <button
                  className="ghost-button"
                  onClick={closeComposer}
                >
                  Close
                </button>
                {editingEntryId ? null : (
                  <button className="save-button" onClick={saveEntry}>
                    Save
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {taskDeleteTarget ? (
        <div className="composer-backdrop" onClick={() => setTaskDeleteTarget(null)}>
          <div className="confirm-card" onClick={(event) => event.stopPropagation()}>
            <h3>Delete task?</h3>
            <p>
              {taskDeleteTarget.name} will be removed. Existing entries using it will move to the next
              available task.
            </p>
            <div className="composer-actions confirm-actions">
              <button className="ghost-button" onClick={() => setTaskDeleteTarget(null)}>
                Close
              </button>
              <button className="danger-button" onClick={() => deleteTask(taskDeleteTarget.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
