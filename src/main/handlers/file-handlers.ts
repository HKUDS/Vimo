import { dialog, ipcMain } from 'electron';
import { readFile, writeFile, stat } from 'node:fs/promises';

/**
 * Register all file-related IPC handlers
 */
export function registerFileHandlers(): void {
  // Echo message handler
  ipcMain.handle('echo-message', async (_, message: string) => {
    // Simple echo functionality - returns whatever user inputs
    return `Echo: ${message}`;
  });

  // Read file handler
  ipcMain.handle('read-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Text Files', extensions: ['txt', 'md'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const content = await readFile(filePath, 'utf-8');
        return { success: true, content, path: filePath };
      }

      return { success: false, error: 'No file selected' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // Save file handler
  ipcMain.handle('save-file', async (_, content: string) => {
    try {
      const result = await dialog.showSaveDialog({
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!result.canceled && result.filePath) {
        await writeFile(result.filePath, content, 'utf-8');
        return { success: true, path: result.filePath };
      }

      return { success: false, error: 'Save cancelled' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // Select folder handler
  ipcMain.handle('select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
      }

      return { success: false, error: 'No folder selected' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // Select video files handler
  ipcMain.handle('select-video-files', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { 
            name: 'Video Files', 
            extensions: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp', 'mpg', 'mpeg'] 
          },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const files: { name: string; path: string; size: number }[] = []; 
        
        for (const filePath of result.filePaths) {
          try {
            const stats = await stat(filePath);
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
            
            files.push({
              name: fileName,
              path: filePath,
              size: stats.size,
            });
          } catch (error) {
            console.error(`Error getting file stats for ${filePath}:`, error);
            continue;
          }
        }
        
        return { success: true, files };
      }

      return { success: false, error: 'No files selected' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });
} 