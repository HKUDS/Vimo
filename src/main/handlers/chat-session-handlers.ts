import { ipcMain } from 'electron';
import { readFile, writeFile, access, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Bootstrap configuration file path
const BOOTSTRAP_CONFIG_FILE = join(homedir(), '.videorag-bootstrap.json');

// Helper function to get the storage directory path
async function getStorageDirectory(): Promise<string | null> {
  try {
    await access(BOOTSTRAP_CONFIG_FILE);
    const content = await readFile(BOOTSTRAP_CONFIG_FILE, 'utf-8');
    const bootstrap = JSON.parse(content);
    return bootstrap.storeDirectory || null;
  } catch (error) {
    // Bootstrap file doesn't exist or invalid
    return null;
  }
}

// Helper function to get individual session file path
async function getSessionFilePath(chatId: string): Promise<string | null> {
  const storageDir = await getStorageDirectory();
  if (!storageDir) return null;
  return join(storageDir, `chat-${chatId}.json`);
}

// Helper function to ensure storage directory exists
async function ensureStorageDirectory(): Promise<void> {
  const storageDir = await getStorageDirectory();
  if (storageDir) {
    await mkdir(storageDir, { recursive: true });
  }
}

// Helper function to get session order config file path
async function getSessionOrderConfigPath(): Promise<string | null> {
  const storageDir = await getStorageDirectory();
  if (!storageDir) return null;
  return join(storageDir, 'session-order.json');
}

// Helper function to load session order
async function loadSessionOrder(): Promise<string[]> {
  try {
    const configPath = await getSessionOrderConfigPath();
    if (!configPath) return [];
    
    await access(configPath);
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    return config.sessionOrder || [];
  } catch (error) {
    return [];
  }
}

// Unified session order update function
async function updateSessionOrder(sessionIds: string[], operation: 'create' | 'delete' | 'reorder' = 'reorder'): Promise<void> {
  try {
    const configPath = await getSessionOrderConfigPath();
    if (!configPath) return;
    
    await ensureStorageDirectory();
    
    let currentOrder: string[] = [];
    
    // Try to load existing order configuration
    try {
      await access(configPath);
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      currentOrder = config.sessionOrder || [];
    } catch (error) {
      // session-order.json not found, create new one
      console.log('📄 session-order.json not found, creating new one');
    }
    
    let newOrder: string[];
    
    switch (operation) {
      case 'create':
        // New session created: add to the beginning (latest at the top)
        newOrder = [
          ...sessionIds.filter(id => !currentOrder.includes(id)),
          ...currentOrder
        ];
        break;
        
      case 'delete':
        // Session deleted: remove from the order
        newOrder = currentOrder.filter(id => !sessionIds.includes(id));
        break;
        
      case 'reorder':
        // Drag and drop reorder: use new order directly
        newOrder = sessionIds;
        break;
        
      default:
        newOrder = sessionIds;
    }
    
    // Save updated order configuration
    const config = {
      sessionOrder: newOrder,
      lastUpdated: new Date().toISOString(),
      operation,
    };
    
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ Session order updated (${operation}):`, newOrder.length, 'sessions');
    
  } catch (error) {
    console.error('Failed to update session order:', error);
  }
}

/**
 * Register all chat session related IPC handlers
 */
export function registerChatSessionHandlers(): void {
  // Load single chat session
  ipcMain.handle('load-chat-session', async (_, chatId: string) => {
    try {
      const sessionFilePath = await getSessionFilePath(chatId);
      if (!sessionFilePath) {
        return { success: false, error: 'Storage directory not configured' };
      }

      await access(sessionFilePath);
      const content = await readFile(sessionFilePath, 'utf-8');
      const session = JSON.parse(content);
      
      return { success: true, session };
    } catch (error) {
      // File doesn't exist, return null
      return { success: true, session: null };
    }
  });

  // Save single chat session
  ipcMain.handle('save-chat-session', async (_, chatId: string, sessionData: Record<string, any>) => {
    try {
      const sessionFilePath = await getSessionFilePath(chatId);
      if (!sessionFilePath) {
        return { success: false, error: 'Storage directory not configured' };
      }

      await ensureStorageDirectory();
      
      // Check if session already exists
      const isNewSession = !(await access(sessionFilePath).then(() => true).catch(() => false));
      
      const dataToSave = {
        ...sessionData,
        lastUpdated: new Date().toISOString()
      };
      
      await writeFile(sessionFilePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
      
      // If new session, update order configuration
      if (isNewSession) {
        await updateSessionOrder([chatId], 'create');
      }
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // List all chat sessions
  ipcMain.handle('list-chat-sessions', async () => {
    try {
      const storageDir = await getStorageDirectory();
      if (!storageDir) {
        return { success: true, sessions: [] };
      }

      await access(storageDir);
      const files = await readdir(storageDir);
      
      const sessionFiles = files.filter(file => file.startsWith('chat-') && file.endsWith('.json'));
      const sessions: any[] = [];

      for (const file of sessionFiles) {
        try {
          const filePath = join(storageDir, file);
          const content = await readFile(filePath, 'utf-8');
          const session = JSON.parse(content);
          sessions.push(session);
        } catch (error) {
          // Skip invalid session files
          console.warn(`Failed to read session file ${file}:`, error);
        }
      }

      // Load user-defined order
      const customOrder = await loadSessionOrder();
      
      // Apply user-defined order
      if (customOrder.length > 0) {
        const orderedSessions: any[] = [];
        const sessionMap = new Map(sessions.map(s => [s.id, s]));
        
        // 1. Add existing sessions in custom order
        for (const sessionId of customOrder) {
          const session = sessionMap.get(sessionId);
          if (session) {
            orderedSessions.push(session);
            sessionMap.delete(sessionId);
          }
        }
        
        // 2. Add new sessions (not in order configuration), sorted by time
        const newSessions = Array.from(sessionMap.values())
          .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
        orderedSessions.push(...newSessions);
        
        return { success: true, sessions: orderedSessions };
      } else {
        // No custom order, use default time sorting
        sessions.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
        return { success: true, sessions };
      }
    } catch (error) {
      // Directory doesn't exist, return empty sessions
      return { success: true, sessions: [] };
    }
  });

  // Delete single chat session
  ipcMain.handle('delete-chat-session', async (_, chatId: string) => {
    try {
      const sessionFilePath = await getSessionFilePath(chatId);
      if (!sessionFilePath) {
        return { success: false, error: 'Storage directory not configured' };
      }

      const { unlink } = await import('node:fs/promises');
      await unlink(sessionFilePath);
      
      // Update order configuration after deletion
      await updateSessionOrder([chatId], 'delete');
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // Get storage directory info
  ipcMain.handle('get-storage-info', async () => {
    try {
      await access(BOOTSTRAP_CONFIG_FILE);
      const content = await readFile(BOOTSTRAP_CONFIG_FILE, 'utf-8');
      const bootstrap = JSON.parse(content);
      
      return { 
        success: true, 
        storeDirectory: bootstrap.storeDirectory,
        isConfigured: !!bootstrap.storeDirectory
      };
    } catch (error) {
      return { 
        success: true, 
        storeDirectory: null,
        isConfigured: false
      };
    }
  });

  // Create storage directory if not exists
  ipcMain.handle('ensure-storage-directory', async () => {
    try {
      await ensureStorageDirectory();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // Unified session order update handler
  ipcMain.handle('update-session-order', async (_, sessionIds: string[], operation: 'create' | 'delete' | 'reorder' = 'reorder') => {
    try {
      await updateSessionOrder(sessionIds, operation);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });
} 