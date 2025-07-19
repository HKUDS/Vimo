/// <reference types="vite/client" />
export interface VideoRAGAPI {
  echoMessage: (message: string) => Promise<string>;
  readFile: () => Promise<{
    success: boolean;
    content?: string;
    path?: string;
    error?: string;
  }>;
  saveFile: (content: string) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;
  selectFolder: () => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  saveSettings: (settings: any) => Promise<{
    success: boolean;
    error?: string;
  }>;
  loadSettings: () => Promise<{
    success: boolean;
    settings?: any;
    error?: string;
  }>;
  testApiKey: (apiKey: string) => Promise<{
    success: boolean;
    error?: string;
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
  // Model file check and download
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

  
  // VideoRAG API methods
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  
  // Chat Session Management API (File System Based)
  chatSessions: {
    load: (chatId: string) => Promise<{ success: boolean; session?: any; error?: string }>;
    save: (chatId: string, sessionData: any) => Promise<{ success: boolean; error?: string }>;
    list: () => Promise<{ success: boolean; sessions?: any[]; error?: string }>;
    delete: (chatId: string) => Promise<{ success: boolean; error?: string }>;
    getStorageInfo: () => Promise<{ success: boolean; storeDirectory?: string; isConfigured?: boolean; error?: string }>;
    ensureStorageDirectory: () => Promise<{ success: boolean; error?: string }>;
    // Unified sorting update API
    updateSessionOrder: (sessionIds: string[], operation?: 'create' | 'delete' | 'reorder') => Promise<{ success: boolean; error?: string }>;
  };
  
  // VideoRAG Service Control
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
    getVideoDuration: (videoPath: string) => Promise<{ success: boolean; duration?: number; fps?: number; width?: number; height?: number; video_path?: string; error?: string }>;
    deleteSession: (chatId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    // Service control
    startService: () => Promise<{ success: boolean; message?: string; error?: string }>;
    stopService: () => Promise<{ success: boolean; message?: string; error?: string }>;
    serviceStatus: () => Promise<{ success: boolean; isRunning?: boolean; message?: string; error?: string }>;
    deleteSession: (chatId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
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

  selectVideoFiles: () => Promise<{ 
    success: boolean; 
    files?: { name: string; path: string; size: number }[]; 
    error?: string 
  }>;
}

declare global {
  interface Window {
    api: VideoRAGAPI;
    electron: {
      process: {
        platform: string;
      };
    };
  }

  // Declare environment variables
  declare const APP_VERSION: string;
}

// Image module declaration
declare module '*.png' {
  const value: any;
  export default value;
}

declare module '*.jpg' {
  const value: any;
  export default value;
}

declare module '*.jpeg' {
  const value: any;
  export default value;
}

declare module '*.svg' {
  const value: any;
  export default value;
}

declare module '*.webp' {
  const value: any;
  export default value;
}

export {};
