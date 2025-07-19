import { ipcMain } from 'electron';
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Bootstrap configuration file path (only stores storeDirectory)
const BOOTSTRAP_CONFIG_FILE = join(homedir(), '.videorag-bootstrap.json');

// Helper function to get the main config file path
async function getMainConfigPath(): Promise<string | null> {
  try {
    await access(BOOTSTRAP_CONFIG_FILE);
    const content = await readFile(BOOTSTRAP_CONFIG_FILE, 'utf-8');
    const bootstrap = JSON.parse(content);
    if (bootstrap.storeDirectory) {
      return join(bootstrap.storeDirectory, 'config.json');
    }
  } catch (error) {
    // Bootstrap file doesn't exist or invalid
  }
  return null;
}

/**
 * Register all settings-related IPC handlers
 */
export function registerSettingsHandlers(): void {
  // Save settings handler
  ipcMain.handle('save-settings', async (_, settings: any) => {
    try {
      // If storeDirectory is being set, save it to bootstrap config
      if (settings.storeDirectory) {
        await writeFile(
          BOOTSTRAP_CONFIG_FILE, 
          JSON.stringify({ storeDirectory: settings.storeDirectory }, null, 2), 
          'utf-8'
        );
      }

      // Get main config path
      const mainConfigPath = await getMainConfigPath();
      if (mainConfigPath) {
        // Ensure the directory exists
        const configDir = join(mainConfigPath, '..');
        await mkdir(configDir, { recursive: true });
        
        // Save all settings to main config file (excluding storeDirectory as it's in bootstrap)
        const { storeDirectory, ...mainSettings } = settings;
        await writeFile(mainConfigPath, JSON.stringify(mainSettings, null, 2), 'utf-8');
      } else {
        // If no storeDirectory set yet, save to bootstrap for now
        await writeFile(
          BOOTSTRAP_CONFIG_FILE, 
          JSON.stringify(settings, null, 2), 
          'utf-8'
        );
      }
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // Load settings handler
  ipcMain.handle('load-settings', async () => {
    try {
      let settings: any = {
        openaiBaseUrl: 'https://api.openai.com/v1',
        openaiApiKey: '',
        processingModel: 'gpt-4o-mini',
        analysisModel: 'gpt-4o-mini',
        dashscopeApiKey: '',
        captionModel: 'qwen-vl-plus-latest',
        asrModel: 'paraformer-realtime-v2',
        storeDirectory: '',
        pythonPath: '',
        pythonInstalled: false,
        pythonVersion: '',
        selectedCondaEnvironment: '',
        imagebindInstalled: false,
      };

      // Try to load bootstrap config first
      try {
        await access(BOOTSTRAP_CONFIG_FILE);
        const bootstrapContent = await readFile(BOOTSTRAP_CONFIG_FILE, 'utf-8');
        const bootstrap = JSON.parse(bootstrapContent);
        settings = { ...settings, ...bootstrap };
      } catch (error) {
        // Bootstrap doesn't exist, use defaults
      }

      // Try to load main config if storeDirectory exists
      const mainConfigPath = await getMainConfigPath();
      if (mainConfigPath) {
        try {
          await access(mainConfigPath);
          const mainContent = await readFile(mainConfigPath, 'utf-8');
          const mainSettings = JSON.parse(mainContent);
          settings = { ...settings, ...mainSettings };
        } catch (error) {
          // Main config doesn't exist yet, use current settings
        }
      }

      return { success: true, settings };
    } catch (error) {
      // Return default settings on error
      return {
        success: true,
        settings: {
          openaiBaseUrl: 'https://api.openai.com/v1',
          openaiApiKey: '',
          processingModel: 'gpt-4o-mini',
          analysisModel: 'gpt-4o-mini',
          dashscopeApiKey: '',
          captionModel: 'qwen-vl-plus-latest',
          asrModel: 'paraformer-realtime-v2',
          storeDirectory: '',
          pythonPath: '',
          pythonInstalled: false,
          pythonVersion: '',
          selectedCondaEnvironment: '',
          imagebindInstalled: false,
        },
      };
    }
  });

  // Test API Key handler
  ipcMain.handle('test-api-key', async (_, apiKey: string) => {
    try {
      if (!apiKey || !apiKey.startsWith('sk-')) {
        return { success: false, error: 'Invalid API key format' };
      }

      // Here you can add actual API testing logic
      // For example, call OpenAI API for verification

      // Simulate API test for now
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}

/**
 * Get the configuration file path
 * @returns string path to config file (returns bootstrap path if main config not available)
 */
export async function getConfigFilePath(): Promise<string> {
  const mainConfigPath = await getMainConfigPath();
  return mainConfigPath || BOOTSTRAP_CONFIG_FILE;
}

/**
 * Get the bootstrap configuration file path (for backward compatibility)
 * @returns string path to bootstrap config file
 */
export function getBootstrapConfigFilePath(): string {
  return BOOTSTRAP_CONFIG_FILE;
} 