import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// Define API types
export interface VideoRAGAPI {
  echoMessage: (message: string) => Promise<string>;
  readFile: () => Promise<{
    success: boolean;
    content?: string;
    path?: string;
    error?: string;
  }>;
  saveFile: (
    content: string,
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  selectFolder: () => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;
  selectVideoFiles: () => Promise<{
    success: boolean;
    files?: Array<{ name: string; path: string; size: number }>;
    error?: string;
  }>;

  saveSettings: (
    settings: any,
  ) => Promise<{ success: boolean; error?: string }>;
  loadSettings: () => Promise<{
    success: boolean;
    settings?: any;
    error?: string;
  }>;
  testApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  processWithVideoRAG: (inputText: string, apiKey?: string) => Promise<{
    success: boolean;
    data?: any;
    error?: string;
    details?: string;
    pythonCommand?: string;
  }>;
  testPythonBackend: () => Promise<{
    success: boolean;
    data?: any;
    error?: string;
    details?: string;
    message?: string;
  }>;
  // VideoRAG environment management
  installVideoragEnvironment: (tempDir: string) => Promise<{
    success: boolean;
    installation_info?: any;
    error?: string;
    details?: string;
  }>;
  getInstallationProgress: (tempDir: string) => Promise<{
    stage: string;
    percentage: number;
    message: string;
  }>;
  checkVideoragEnvironment: () => Promise<{
    installed: boolean;
    config?: any;
    message?: string;
  }>;
  processWithVideoragEnv: (query: string, videoPath?: string) => Promise<{
    success: boolean;
    data?: any;
    environment?: string;
    error?: string;
    details?: string;
  }>;
  // Model file checking and downloading
  checkModelFiles: (storeDirectory: string) => Promise<{
    imagebind: boolean;
  }>;
  downloadImageBind: (storeDirectory: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // Event listeners
  onDownloadProgress: (callback: (event: any, data: { type: string, progress: number, downloaded?: number, total?: number }) => void) => void;
  onDownloadError: (callback: (event: any, data: { type: string, error: string }) => void) => void;
  removeDownloadListeners: () => void;

  
  // Chat Session Management API (File System Based)
  chatSessions: {
    load: (chatId: string) => Promise<{ success: boolean; session?: any; error?: string }>;
    save: (chatId: string, sessionData: any) => Promise<{ success: boolean; error?: string }>;
    list: () => Promise<{ success: boolean; sessions?: any[]; error?: string }>;
    delete: (chatId: string) => Promise<{ success: boolean; error?: string }>;
    getStorageInfo: () => Promise<{ success: boolean; storeDirectory?: string; isConfigured?: boolean; error?: string }>;
    ensureStorageDirectory: () => Promise<{ success: boolean; error?: string }>;
    updateSessionOrder: (sessionIds: string[], operation?: 'create' | 'delete' | 'reorder') => Promise<{ success: boolean; error?: string }>;
  };

  // VideoRAG Service Control API
  videorag: {
    healthCheck: () => Promise<{ success: boolean; data?: any; error?: string }>;
    initialize: (config: any) => Promise<{ success: boolean; data?: any; error?: string }>;
    uploadVideo: (chatId: string, videoPathList: string[], baseStoragePath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    getStatus: (chatId: string, type?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    listIndexed: (chatId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    sessionStatus: (chatId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    query: (chatId: string, query: string, mode?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    queryVideo: (chatId: string, query: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    systemStatus: () => Promise<{ success: boolean; data?: any; error?: string }>;
    getVideoDuration: (videoPath: string) => Promise<{ success: boolean; duration?: number; fps?: number; width?: number; height?: number; error?: string }>;
    deleteSession: (chatId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    // Service control
    startService: () => Promise<{ success: boolean; message?: string; error?: string }>;
    stopService: () => Promise<{ success: boolean; message?: string; error?: string }>;
    serviceStatus: () => Promise<{ success: boolean; isRunning?: boolean; message?: string; error?: string }>;
    loadImageBind: () => Promise<{ success: boolean; data?: any; error?: string }>;
    releaseImageBind: () => Promise<{ success: boolean; data?: any; error?: string }>;
    imagebindStatus: () => Promise<{ success: boolean; data?: any; error?: string }>;
    reinitializeConfig: () => Promise<{ success: boolean; message?: string; error?: string }>;
  };

  // App control
  app: {
    restart: () => Promise<{ success: boolean; error?: string }>;
    clearConfig: () => Promise<{ success: boolean; error?: string }>;
  };
}

// Custom API
const api: VideoRAGAPI = {
  echoMessage: (message: string) => ipcRenderer.invoke('echo-message', message),
  readFile: () => ipcRenderer.invoke('read-file'),
  saveFile: (content: string) => ipcRenderer.invoke('save-file', content),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectVideoFiles: () => ipcRenderer.invoke('select-video-files'),

  saveSettings: (settings: any) =>
    ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  testApiKey: (apiKey: string) => ipcRenderer.invoke('test-api-key', apiKey),
  processWithVideoRAG: (inputText: string, apiKey?: string) => 
    ipcRenderer.invoke('process-with-videorag', inputText, apiKey),
  testPythonBackend: () => ipcRenderer.invoke('test-python-backend'),
  // VideoRAG environment management
  installVideoragEnvironment: (tempDir: string) =>
    ipcRenderer.invoke('install-videorag-environment', tempDir),
  getInstallationProgress: (tempDir: string) =>
    ipcRenderer.invoke('get-installation-progress', tempDir),
  checkVideoragEnvironment: () =>
    ipcRenderer.invoke('check-videorag-environment'),
  processWithVideoragEnv: (query: string, videoPath?: string) =>
    ipcRenderer.invoke('process-with-videorag-env', query, videoPath),
  // Model file checking and downloading
  checkModelFiles: (storeDirectory: string) =>
    ipcRenderer.invoke('check-model-files', storeDirectory),
  downloadImageBind: (storeDirectory: string) =>
    ipcRenderer.invoke('download-imagebind', storeDirectory),

  // Event listener implementations
  onDownloadProgress: (callback: (event: any, data: { type: string, progress: number, downloaded?: number, total?: number }) => void) => {
    ipcRenderer.on('download-progress', callback);
  },
  onDownloadError: (callback: (event: any, data: { type: string, error: string }) => void) => {
    ipcRenderer.on('download-error', callback);
  },
  removeDownloadListeners: () => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.removeAllListeners('download-error');
  },

  
  // Chat Session Management API implementation
  chatSessions: {
    load: (chatId: string) => ipcRenderer.invoke('load-chat-session', chatId),
    save: (chatId: string, sessionData: any) => ipcRenderer.invoke('save-chat-session', chatId, sessionData),
    list: () => ipcRenderer.invoke('list-chat-sessions'),
    delete: (chatId: string) => ipcRenderer.invoke('delete-chat-session', chatId),
    getStorageInfo: () => ipcRenderer.invoke('get-storage-info'),
    ensureStorageDirectory: () => ipcRenderer.invoke('ensure-storage-directory'),
    updateSessionOrder: (sessionIds: string[], operation?: 'create' | 'delete' | 'reorder') => ipcRenderer.invoke('update-session-order', sessionIds, operation),
  },
  
  // VideoRAG Service Control API implementation
  videorag: {
    healthCheck: () => ipcRenderer.invoke('videorag:health-check'),
    initialize: (config: any) => ipcRenderer.invoke('videorag:initialize', config),
    uploadVideo: (chatId: string, videoPathList: string[], baseStoragePath: string) => ipcRenderer.invoke('videorag:upload-video', chatId, videoPathList, baseStoragePath),
    getStatus: (chatId: string, type?: string) => ipcRenderer.invoke('videorag:get-status', chatId, type),
    listIndexed: (chatId: string) => ipcRenderer.invoke('videorag:list-indexed', chatId),
    sessionStatus: (chatId: string) => ipcRenderer.invoke('videorag:session-status', chatId),
    query: (chatId: string, query: string, mode?: string) => ipcRenderer.invoke('videorag:query', chatId, query, mode),
    queryVideo: (chatId: string, query: string) => ipcRenderer.invoke('videorag:query-video', chatId, query),
    systemStatus: () => ipcRenderer.invoke('videorag:system-status'),
    getVideoDuration: (videoPath: string) => ipcRenderer.invoke('videorag:get-video-duration', videoPath),
    deleteSession: (chatId: string) => ipcRenderer.invoke('videorag:delete-session', chatId),
    // Service control
    startService: () => ipcRenderer.invoke('videorag:start-service'),
    stopService: () => ipcRenderer.invoke('videorag:stop-service'),
    serviceStatus: () => ipcRenderer.invoke('videorag:service-status'),
    loadImageBind: () => ipcRenderer.invoke('videorag:load-imagebind'),
    releaseImageBind: () => ipcRenderer.invoke('videorag:release-imagebind'),
    imagebindStatus: () => ipcRenderer.invoke('videorag:imagebind-status'),
    reinitializeConfig: () => ipcRenderer.invoke('videorag:reinitialize-config')
  },

  // App control
  app: {
    restart: () => ipcRenderer.invoke('app:restart'),
    clearConfig: () => ipcRenderer.invoke('app:clear-config'),
  },
};

// Use electronAPI in development environment, expose only necessary API in production
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
