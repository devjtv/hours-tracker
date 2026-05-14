const { app, BrowserWindow, clipboard, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const DATA_FILE = 'hours-tracker-data.json';
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WINDOW_BOUNDS = { width: 1440, height: 920 };
const LEGACY_DEMO_PROJECTS = new Set([
  'Uniplan Website Updates',
  'Akura - button options',
  '28484 - Thursday Landing Page',
  '26240 - Masterkraft support hours',
  'Break'
]);
const LEGACY_DEMO_TASK_NAMES = new Set([
  'Without task',
  'Break',
  'Maintenance (Nicky)',
  'Maintenance (Felicity)',
  'Maintenance (Paul)',
  'Maintenance (Shaun)',
  'Meeting',
  'Development',
  'Research',
  'Quoting',
  'ADDED TO CENTRAL'
]);
const DEFAULT_TASKS = [{ id: 'task-none', name: 'Without task', color: '#5f7cf6' }];

const seedData = {
  entries: [],
  tasks: DEFAULT_TASKS,
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

function cloneSeedData() {
  return JSON.parse(JSON.stringify(seedData));
}

function getDataPath() {
  return path.join(app.getPath('userData'), DATA_FILE);
}

function normalizeData(raw) {
  const base = cloneSeedData();
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const entries = Array.isArray(incoming.entries) ? incoming.entries : [];
  const hasOnlyLegacyDemoEntries =
    entries.length > 0 &&
    entries.every(
      (entry) =>
        entry &&
        typeof entry.project === 'string' &&
        LEGACY_DEMO_PROJECTS.has(entry.project)
    );
  const incomingTasks = Array.isArray(incoming.tasks) ? incoming.tasks : [];
  const hasOnlyLegacyDemoTasks =
    incomingTasks.length > 0 &&
    incomingTasks.every(
      (task) =>
        task &&
        typeof task.name === 'string' &&
        LEGACY_DEMO_TASK_NAMES.has(task.name)
    );

  const safeTasks =
    incomingTasks.length > 0 && !hasOnlyLegacyDemoTasks ? incomingTasks : base.tasks;
  const taskIds = new Set(safeTasks.map((task) => task.id));
  const safeTags = Array.isArray(incoming.tags) ? incoming.tags : [];
  const safeSettings = {
    ...base.settings,
    ...(incoming.settings && typeof incoming.settings === 'object' ? incoming.settings : {})
  };
  const resolvedDefaultTaskId = taskIds.has(safeSettings.defaultTaskId)
    ? safeSettings.defaultTaskId
    : safeTasks[0].id;

  return {
    entries: (hasOnlyLegacyDemoEntries ? [] : entries).map((entry) => ({
      ...entry,
      taskId: taskIds.has(entry.taskId) ? entry.taskId : safeTasks[0].id,
      tagIds: Array.isArray(entry.tagIds) ? entry.tagIds : []
    })),
    tasks: safeTasks,
    tags: hasOnlyLegacyDemoEntries ? [] : safeTags,
    settings: {
      ...safeSettings,
      defaultTaskId: resolvedDefaultTaskId
    }
  };
}

async function readData() {
  const filePath = getDataPath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const normalized = normalizeData(JSON.parse(raw));
    await writeData(normalized);
    return normalized;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const freshData = cloneSeedData();
      await writeData(freshData);
      return freshData;
    }
    throw error;
  }
}

async function writeData(data) {
  const filePath = getDataPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function requestProviderReport(settings, messages) {
  if (!settings?.endpoint || !settings?.model || !settings?.apiKey) {
    throw new Error('Provider endpoint, model, and API key are required.');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKey}`
  };

  if (settings.providerType === 'openrouter') {
    headers['HTTP-Referer'] = 'https://hours-tracker.local';
    headers['X-Title'] = 'Hours Tracker';
  }

  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Provider error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const content =
    result?.choices?.[0]?.message?.content ??
    result?.content?.[0]?.text ??
    result?.output_text;

  if (!content) {
    throw new Error('No report text returned from provider.');
  }

  return { content };
}

function getIconPath() {
  const candidates = [
    path.join(__dirname, '../assets/icon.png'),
    path.join(process.resourcesPath || '', 'assets/icon.png')
  ];
  return candidates.find((candidate) => {
    try {
      require('node:fs').accessSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

function getWindowStatePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

async function readWindowState() {
  try {
    const raw = await fs.readFile(getWindowStatePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    const width = Number.isFinite(parsed.width) ? parsed.width : DEFAULT_WINDOW_BOUNDS.width;
    const height = Number.isFinite(parsed.height) ? parsed.height : DEFAULT_WINDOW_BOUNDS.height;
    const x = Number.isFinite(parsed.x) ? parsed.x : undefined;
    const y = Number.isFinite(parsed.y) ? parsed.y : undefined;
    const isMaximized = Boolean(parsed.isMaximized);
    return { width, height, x, y, isMaximized };
  } catch {
    return { ...DEFAULT_WINDOW_BOUNDS, isMaximized: false };
  }
}

async function writeWindowState(state) {
  try {
    await fs.writeFile(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('[window-state] save failed', error);
  }
}

async function createWindow() {
  const iconPath = getIconPath();
  const saved = await readWindowState();
  const mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 520,
    minHeight: 560,
    backgroundColor: '#1f1f20',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (saved.isMaximized) {
    mainWindow.maximize();
  }

  let saveTimer = null;
  const persistBounds = () => {
    if (mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getNormalBounds();
    writeWindowState({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized()
    });
  };
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistBounds, 400);
  };
  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);
  mainWindow.on('maximize', scheduleSave);
  mainWindow.on('unmaximize', scheduleSave);
  mainWindow.on('close', persistBounds);

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('storage:load', async () => readData());
  ipcMain.handle('storage:save', async (_event, payload) => {
    await writeData(payload);
    return { ok: true };
  });
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('clipboard:write', async (_event, payload) => {
    clipboard.write({
      text: payload?.text ?? '',
      html: payload?.html
    });
    return { ok: true };
  });
  ipcMain.handle('report:generate', async (_event, payload) => {
    const { settings, entries, tasks, tags, dateLabel } = payload;

    const taskMap = Object.fromEntries(tasks.map((task) => [task.id, task]));
    const tagMap = Object.fromEntries(tags.map((tag) => [tag.id, tag.name]));
    const worklog = entries.map((entry) => ({
      project: entry.project,
      details: entry.details,
      task: taskMap[entry.taskId]?.name ?? 'Without task',
      tags: entry.tagIds.map((tagId) => tagMap[tagId]).filter(Boolean),
      start: entry.start,
      end: entry.end,
      minutes: Math.max(
        0,
        Math.round((new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000)
      )
    }));

    return requestProviderReport(settings, [
      { role: 'system', content: settings.reportPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          date: dateLabel,
          entries: worklog
        })
      }
    ]);
  });

  ipcMain.handle('report:refine', async (_event, payload) => {
    const { settings, entries, tasks, tags, dateLabel, currentReport, feedback } = payload;
    const taskMap = Object.fromEntries(tasks.map((task) => [task.id, task]));
    const tagMap = Object.fromEntries(tags.map((tag) => [tag.id, tag.name]));
    const worklog = entries.map((entry) => ({
      project: entry.project,
      details: entry.details,
      task: taskMap[entry.taskId]?.name ?? 'Without task',
      tags: entry.tagIds.map((tagId) => tagMap[tagId]).filter(Boolean),
      start: entry.start,
      end: entry.end,
      minutes: Math.max(
        0,
        Math.round((new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000)
      )
    }));

    return requestProviderReport(settings, [
      { role: 'system', content: settings.reportPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          date: dateLabel,
          entries: worklog,
          currentReport,
          feedback,
          instruction:
            'Revise the current report using the feedback. Preserve the requested output format unless the feedback explicitly asks to change it.'
        })
      }
    ]);
  });

  if (process.platform === 'darwin' && app.dock) {
    const iconPath = getIconPath();
    if (iconPath) {
      try {
        app.dock.setIcon(iconPath);
      } catch {}
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
