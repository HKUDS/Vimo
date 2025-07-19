import { ipcMain } from 'electron'
import axios from 'axios'
import { ChildProcess, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

let VIDEORAG_API_BASE_URL = 'http://localhost:64451/api'

// Update API base URL
function updateAPIBaseURL(port: number) {
  VIDEORAG_API_BASE_URL = `http://localhost:${port}/api`
  console.log(`📡 Updated API base URL to: ${VIDEORAG_API_BASE_URL}`)
}

// Python backend process management
let pythonProcess: ChildProcess | null = null

// Port configuration
const PORT_RANGE_START = 64451
const PORT_RANGE_END = 64470

// Efficiently scan port range to find VideoRAG service
async function scanForVideoRAGService(startPort?: number, endPort?: number): Promise<number | null> {
  const start = startPort || PORT_RANGE_START
  const end = endPort || PORT_RANGE_END
  
  console.log(`🔍 Scanning for VideoRAG service on ports ${start}-${end}...`)
  
  for (let port = start; port <= end; port++) {
    try {
      const isHealthy = await attemptHealthCheck(port)
      if (isHealthy) {
        console.log(`🎯 Found healthy VideoRAG service on port ${port}`)
        return port
      }
    } catch (error) {
      // Continue checking next port
      continue
    }
  }
  
  console.log(`❌ No VideoRAG service found in port range ${start}-${end}`)
  return null
}

// Start Python backend service
export function startVideoRAGService(): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    try {
      // Check if we're in development environment
      const isDev = process.env.NODE_ENV === 'development'
      
      // Prevent multiple resolve/reject
      let resolved = false
      const safeResolve = (value: boolean) => {
        if (!resolved) {
          resolved = true
          resolve(value)
        }
      }
      const safeReject = (error: Error) => {
        if (!resolved) {
          resolved = true
          reject(error)
        }
      }

      if (isDev) {
        // Development mode: skip starting backend, but still scan for existing service
        console.log('🚀 Development mode detected - skipping backend service startup')
        console.log('💡 In development, scanning for manually started Python backend...')
      } else {
        // Production mode: start the packaged executable
        console.log('🚀 Production mode - starting packaged backend service')
        
        // Determine executable path for production
        const executableName = process.platform === 'win32' ? 'videorag_api.exe' : 'videorag_api'
        const executablePath = path.join(process.resourcesPath, 'python_backend', 'dist', 'videorag_api', executableName)
        
        // Check if executable exists
        if (!fs.existsSync(executablePath)) {
          console.error(`❌ Packaged executable not found at: ${executablePath}`)
          safeReject(new Error(`VideoRAG executable not found at: ${executablePath}`))
          return
        }

        console.log(`✅ Found packaged executable: ${executablePath}`)

        // Start packaged executable
        try {
          console.log(`🚀 Starting VideoRAG service with packaged executable: ${executablePath}`)
          
          pythonProcess = spawn(executablePath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.dirname(executablePath),
            env: { ...process.env },
          })
          
          pythonProcess.stdout?.on('data', (data) => {
            const output = data.toString()
            console.log(`VideoRAG API: ${output}`)
          })

          pythonProcess.stderr?.on('data', (data) => {
            const errorStr = data.toString()
            console.error(`VideoRAG API Error: ${errorStr}`)
          })
          
          console.log(`✅ Successfully started packaged executable`)
          
        } catch (error) {
          console.error(`❌ Failed to start packaged executable:`, error)
          safeReject(new Error(`Failed to start packaged executable: ${error}`))
          return
        }

        if (!pythonProcess) {
          safeReject(new Error('Failed to start packaged executable. Please ensure the executable was built correctly.'))
          return
        }

        pythonProcess.on('close', (code) => {
          console.log(`VideoRAG API process exited with code ${code}`)
          pythonProcess = null
          if (!resolved) {
            safeReject(new Error(`VideoRAG process exited with code ${code}`))
          }
        })

        pythonProcess.on('error', (error) => {
          console.error(`Python process error:`, error)
          if (!resolved) {
            safeReject(error)
          }
        })
      }

      // Smart timeout handling - continuous scanning
      setTimeout(async () => {
        if (!resolved) {
          console.log('⏳ Initial timeout reached, starting continuous service detection...')
          
          let scanAttempts = 0
          const maxScanAttempts = 1000000 // Maximum scan attempts
          const scanInterval = 3000 // Scan every 3 seconds
          
          const continuousScan = async () => {
            scanAttempts++
            console.log(`🔍 Scanning attempt ${scanAttempts}/${maxScanAttempts}...`)
            
            const foundPort = await scanForVideoRAGService(PORT_RANGE_START, PORT_RANGE_END)
            if (foundPort) {
              console.log(`✅ Found service on port ${foundPort} after ${scanAttempts} attempts!`)
              updateAPIBaseURL(foundPort)
              initializeVideoRAGConfig()
                .then(() => safeResolve(true))
                .catch(() => {
                  console.error('Configuration initialization failed, but service is running')
                  safeResolve(true) // Service started, even if configuration fails
                })
              return
            }
            
            // If not reached maximum attempts, continue scanning
            if (scanAttempts < maxScanAttempts) {
              console.log(`❌ Service not found, retrying in ${scanInterval/1000} seconds... (${scanAttempts}/${maxScanAttempts})`)
              setTimeout(continuousScan, scanInterval)
            } else {
              console.error(`❌ Failed to locate VideoRAG service after ${maxScanAttempts} scan attempts`)
              safeReject(new Error(`Failed to locate VideoRAG service after ${maxScanAttempts} scan attempts over ${(maxScanAttempts * scanInterval / 1000)} seconds`))
            }
          }
          
          // Start first scan
          continuousScan()
        }
      }, 10000) // Start scanning after 10 seconds

    } catch (error) {
      reject(error)
    }
  })
}

// Stop Python backend service
export function stopVideoRAGService() {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill()
    pythonProcess = null
  }
}

// API call helper function - supports asynchronous operations
async function callVideoRAGAPI(endpoint: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', data?: any, customTimeout?: number) {
  // Set different timeouts for different operations
  let timeout = customTimeout || 30000; // Default 30 seconds
  
  // Asynchronous operation: return quickly, do not wait for completion
  if (endpoint.includes('/upload')) {
    timeout = customTimeout || 60000; // Video upload operation: 60 seconds
  } else if (endpoint.includes('/initialize')) {
    timeout = customTimeout || 120000; // Initialization still needs to wait: 2 minutes
  } else if (endpoint.includes('/status')) {
    timeout = customTimeout || 10000;  // Status query: 10 seconds
  } else if (endpoint.includes('/imagebind/load') || endpoint.includes('/imagebind/release')) {
    timeout = customTimeout || 180000; // ImageBind model load/release: 3 minutes
  } else if (endpoint.includes('/imagebind/status')) {
    timeout = customTimeout || 10000;  // ImageBind status query: 10 seconds
  }
  
  try {
    console.log(`📡 API call: ${method} ${endpoint} (timeout: ${timeout}ms)`)
    const response = await axios({
      method,
      url: `${VIDEORAG_API_BASE_URL}${endpoint}`,
      data,
      timeout
    })
    return response.data
  } catch (error: any) {
    console.error(`VideoRAG API call failed:`, error)
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Request timeout after ${timeout}ms. The operation might need more time to complete.`)
    }
    throw new Error(error.response?.data?.error || error.message || 'API call failed')
  }
}

// Modify: automatically initialize VideoRAG configuration, dynamically build ImageBind path
async function initializeVideoRAGConfig(): Promise<void> {
  try {
    console.log('🔧 Loading VideoRAG configuration...')
    
    // 1. Load basic configuration from settings
    const settingsResult = await loadSettingsFromFile()
    if (!settingsResult.success) {
      throw new Error('Failed to load settings')
    }
    
    const settings = settingsResult.settings
    console.log('🔧 Loaded settings:', {
      ...settings,
      // Hide sensitive information
      openaiApiKey: settings.openaiApiKey ? '***' : 'NOT_SET',
      dashscopeApiKey: settings.dashscopeApiKey ? '***' : 'NOT_SET'
    })
    
    // 2. Dynamically build ImageBind model path
    let imagebindModelPath = ''
    if (settings.storeDirectory) {
      imagebindModelPath = require('path').join(settings.storeDirectory, 'imagebind_huge', 'imagebind_huge.pth')
      console.log('🔧 Constructed ImageBind path:', imagebindModelPath)
    }
    
    // 3. Build VideoRAG configuration object (only set default values for allowed fields)
    const videoragConfig = {
      // Required fields - no default values
      ali_dashscope_api_key: settings.dashscopeApiKey,
      openai_api_key: settings.openaiApiKey,
      image_bind_model_path: imagebindModelPath, // Use dynamically built path
      base_storage_path: settings.storeDirectory,
      
      // Fields with default values
      ali_dashscope_base_url: settings.dashscopeBaseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      openai_base_url: settings.openaiBaseUrl || 'https://api.openai.com/v1',
      analysisModel: settings.analysisModel || 'gpt-4o-mini',
      processingModel: settings.processingModel || 'gpt-4o-mini',
      caption_model: settings.captionModel || 'qwen-vl-plus-latest',
      asr_model: settings.asrModel || 'paraformer-realtime-v2'
    }
    
    console.log('🔧 VideoRAG configuration validation:', {
      ali_dashscope_api_key: videoragConfig.ali_dashscope_api_key ? '✅ SET' : '❌ MISSING',
      ali_dashscope_base_url: '✅ SET (default allowed)',
      openai_api_key: videoragConfig.openai_api_key ? '✅ SET' : '❌ MISSING',
      openai_base_url: '✅ SET (default allowed)',
      image_bind_model_path: videoragConfig.image_bind_model_path ? '✅ SET' : '❌ MISSING',
      base_storage_path: videoragConfig.base_storage_path ? '✅ SET' : '❌ MISSING',
      analysisModel: '✅ SET (default allowed)',
      processingModel: '✅ SET (default allowed)',
      caption_model: '✅ SET (default allowed)',
      asr_model: '✅ SET (default allowed)'
    })
    
    // 4. Validate required fields
    const missingFields: string[] = []
    
    if (!videoragConfig.ali_dashscope_api_key || videoragConfig.ali_dashscope_api_key.trim() === '') {
      missingFields.push('Ali Dashscope API Key (dashscopeApiKey)')
    }
    
    if (!videoragConfig.openai_api_key || videoragConfig.openai_api_key.trim() === '') {
      missingFields.push('OpenAI API Key (openaiApiKey)')
    }
    
    if (!videoragConfig.base_storage_path || videoragConfig.base_storage_path.trim() === '') {
      missingFields.push('Base Storage Path (storeDirectory)')
    }
    
    if (!videoragConfig.image_bind_model_path || videoragConfig.image_bind_model_path.trim() === '') {
      missingFields.push('ImageBind Model Path (storeDirectory + imagebind_huge/imagebind_huge.pth)')
    }
    
    // 5. If there are missing fields, throw an error and stop the service
    if (missingFields.length > 0) {
      const errorMessage = `❌ VideoRAG configuration validation failed!\n\nMissing required fields:\n${missingFields.map(field => `  • ${field}`).join('\n')}\n\nPlease run the initialization wizard to configure these settings.`
      
      console.error(errorMessage)
      
      // Stop VideoRAG service
      console.log('🛑 Stopping VideoRAG service due to configuration errors...')
      stopVideoRAGService()
      
      throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`)
    }
    
    // 6. Validate ImageBind model file exists
    try {
      const { access } = await import('node:fs/promises')
      await access(videoragConfig.image_bind_model_path)
      console.log('✅ ImageBind model file verified:', videoragConfig.image_bind_model_path)
    } catch (error) {
      const errorMessage = `❌ ImageBind model file not found: ${videoragConfig.image_bind_model_path}\n\nThe file should be downloaded during initialization wizard.\nPlease run the initialization wizard to download the ImageBind model.`
      
      console.error(errorMessage)
      
      // Stop VideoRAG service
      console.log('🛑 Stopping VideoRAG service due to missing model file...')
      stopVideoRAGService()
      
      throw new Error(`ImageBind model file not found: ${videoragConfig.image_bind_model_path}`)
    }
    
    // 7. Validate storage directory is accessible/creatable
    try {
      const { access, mkdir } = await import('node:fs/promises')
      try {
        await access(videoragConfig.base_storage_path)
        console.log('✅ Storage directory verified:', videoragConfig.base_storage_path)
      } catch (error) {
        // Directory not found, attempt to create
        console.log('📁 Storage directory not found, attempting to create:', videoragConfig.base_storage_path)
        await mkdir(videoragConfig.base_storage_path, { recursive: true })
        console.log('✅ Storage directory created successfully:', videoragConfig.base_storage_path)
      }
    } catch (error) {
      const errorMessage = `❌ Cannot access or create storage directory: ${videoragConfig.base_storage_path}\n\nPlease ensure the path is valid and you have write permissions.`
      
      console.error(errorMessage)
      
      // Stop VideoRAG service
      console.log('🛑 Stopping VideoRAG service due to storage directory error...')
      stopVideoRAGService()
      
      throw new Error(`Storage directory error: ${videoragConfig.base_storage_path}`)
    }
    
    console.log('🔧 All required configuration validated successfully:', {
      ...videoragConfig,
      // Hide sensitive information for logging
      ali_dashscope_api_key: '***',
      openai_api_key: '***'
    })
    
    // 8. Call VideoRAG API for initialization
    const result = await callVideoRAGAPI('/initialize', 'POST', videoragConfig)
    
    if (result.success) {
      console.log('✅ VideoRAG global configuration set successfully!')
    } else {
      console.error('❌ VideoRAG API initialization failed:', result.error)
      
      // Stop VideoRAG service
      console.log('🛑 Stopping VideoRAG service due to API initialization failure...')
      stopVideoRAGService()
      
      throw new Error(`VideoRAG initialization failed: ${result.error}`)
    }
    
  } catch (error) {
    console.error('❌ VideoRAG configuration initialization failed:', error)
    throw error
  }
}

// Modify: load settings from file, remove hardcoded imagebind path
async function loadSettingsFromFile(): Promise<{ success: boolean; settings?: any; error?: string }> {
  try {
    const { readFile, access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { homedir } = await import('node:os')
    
    const BOOTSTRAP_CONFIG_FILE = join(homedir(), '.videorag-bootstrap.json')
    
    let settings: any = {
      // Only set default values for fields with allowed defaults
      openaiBaseUrl: 'https://api.openai.com/v1',
      dashscopeBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      processingModel: 'gpt-4o-mini',
      analysisModel: 'gpt-4o-mini',
      
      // Required fields without default values
      openaiApiKey: '',
      dashscopeApiKey: '',
      storeDirectory: '', // This determines the imagebind model path
      // imagebindModelPath field removed, because it is dynamically built
    }

    // Try to load bootstrap configuration
    try {
      await access(BOOTSTRAP_CONFIG_FILE)
      const bootstrapContent = await readFile(BOOTSTRAP_CONFIG_FILE, 'utf-8')
      const bootstrap = JSON.parse(bootstrapContent)
      settings = { ...settings, ...bootstrap }
      console.log('📁 Loaded bootstrap config:', Object.keys(bootstrap))
    } catch (error) {
      // Bootstrap file not found, using defaults
      console.log('📁 Bootstrap config not found, using defaults')
    }

    // Try to load main configuration file
    if (settings.storeDirectory) {
      try {
        const mainConfigPath = join(settings.storeDirectory, 'config.json')
        await access(mainConfigPath)
        const mainContent = await readFile(mainConfigPath, 'utf-8')
        const mainSettings = JSON.parse(mainContent)
        settings = { ...settings, ...mainSettings }
        console.log('📁 Loaded main config from:', mainConfigPath)
      } catch (error) {
        // Main config file not found, using current settings
        console.log('📁 Main config not found, using bootstrap + defaults')
      }
    }

    return { success: true, settings }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// IPC handlers setup
export function setupVideoRAGHandlers() {
  
  // Manually start service
  ipcMain.handle('videorag:start-service', async () => {
    try {
      const isDev = process.env.NODE_ENV === 'development'
      
      // Production mode: check if already running first
      if (!isDev && pythonProcess && !pythonProcess.killed) {
        return { success: true, message: 'Service is already running' }
      }
      
      // Both dev and production: start service (dev will skip actual startup but scan for existing)
      const result = await startVideoRAGService()
      
      if (isDev) {
        return { 
          success: result, 
          message: result 
            ? 'Found manually started backend service' 
            : 'No backend service found - please start it manually'
        }
      } else {
        return { 
          success: result, 
          message: result ? 'Service started successfully' : 'Failed to start service' 
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Manually stop service
  ipcMain.handle('videorag:stop-service', async () => {
    try {
      const isDev = process.env.NODE_ENV === 'development'
      
      if (isDev) {
        // Development mode: return mock response
        return { 
          success: true, 
          message: 'Development mode - backend service not managed by Electron'
        }
      }
      
      // Production mode: actually stop the service
      stopVideoRAGService()
      return { success: true, message: 'Service stopped successfully' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get service status
  ipcMain.handle('videorag:service-status', async () => {
    try {
      const isDev = process.env.NODE_ENV === 'development'
      
      if (isDev) {
        // Development mode: return mock status
        return { 
          success: true, 
          isRunning: false, 
          pythonProcess: 'development_mode',
          message: 'Development mode - backend service not managed by Electron'
        }
      }
      
      // Production mode: check actual process status
      const isRunning = pythonProcess && !pythonProcess.killed
      return { success: true, isRunning, pythonProcess: isRunning ? 'running' : 'stopped' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  
  // Check API health status
  ipcMain.handle('videorag:health-check', async () => {
    try {
      const result = await callVideoRAGAPI('/health')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Set global configuration
  ipcMain.handle('videorag:initialize', async (_, config) => {
    try {
      const result = await callVideoRAGAPI('/initialize', 'POST', config)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })



  // Upload video for specific session and start indexing
  ipcMain.handle('videorag:upload-video', async (_, chatId: string, videoPathList: string[], baseStoragePath: string) => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/videos/upload`, 'POST', {
        video_path_list: videoPathList,
        base_storage_path: baseStoragePath
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get indexing status for specific session
  ipcMain.handle('videorag:get-status', async (_, chatId: string, type?: string) => {
    try {
      const url = type ? `/sessions/${chatId}/status?type=${type}` : `/sessions/${chatId}/status`
      const result = await callVideoRAGAPI(url)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get list of indexed videos for specific session
  ipcMain.handle('videorag:list-indexed', async (_, chatId: string) => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/videos/indexed`)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get status for specific session
  ipcMain.handle('videorag:session-status', async (_, chatId: string) => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/status`)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Query video content for specific session (to be implemented)
  ipcMain.handle('videorag:query', async (_, chatId: string, query: string, mode: string = 'videorag') => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/query`, 'POST', { query, mode })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // New: start query processing
  ipcMain.handle('videorag:query-video', async (_, chatId: string, query: string) => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/query`, 'POST', { query })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get system status
  ipcMain.handle('videorag:system-status', async () => {
    try {
      const result = await callVideoRAGAPI('/system/status')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get video duration
  ipcMain.handle('videorag:get-video-duration', async (_, videoPath: string) => {
    try {
      console.log(`📄 Getting video duration for: ${videoPath}`)
      // Video duration detection may take a long time, especially for large files
      const result = await callVideoRAGAPI('/video/duration', 'POST', { video_path: videoPath }, 60000)
      return { success: true, ...result }
    } catch (error: any) {
      console.error(`❌ Failed to get video duration for ${videoPath}:`, error.message)
      return { success: false, error: error.message }
    }
  })

  // New: handler to get localStorage configuration from renderer process
  ipcMain.handle('videorag:get-localStorage-config', async () => {
    try {
      // This handler will be called by the renderer process, to get the configuration from localStorage
      // Actual localStorage reading needs to be done in the renderer process
      return { success: true, message: 'This handler should be called from renderer' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // New: manually reinitialize configuration
  ipcMain.handle('videorag:reinitialize-config', async () => {
    try {
      await initializeVideoRAGConfig()
      return { success: true, message: 'Configuration reinitialized successfully' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Delete specific session and its resources
  ipcMain.handle('videorag:delete-session', async (_, chatId: string) => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/delete`, 'DELETE')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Load ImageBind model
  ipcMain.handle('videorag:load-imagebind', async () => {
    try {
      const result = await callVideoRAGAPI('/imagebind/load', 'POST')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Release ImageBind model
  ipcMain.handle('videorag:release-imagebind', async () => {
    try {
      const result = await callVideoRAGAPI('/imagebind/release', 'POST')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get ImageBind status
  ipcMain.handle('videorag:imagebind-status', async () => {
    try {
      const result = await callVideoRAGAPI('/imagebind/status', 'GET')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Application restart
  ipcMain.handle('app:restart', async () => {
    try {
      const { app } = await import('electron')
      app.relaunch()
      app.exit(0)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Clean configuration file
  ipcMain.handle('app:clear-config', async () => {
    try {
      const { unlink } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const { homedir } = await import('node:os')
      
      const BOOTSTRAP_CONFIG_FILE = join(homedir(), '.videorag-bootstrap.json')
      
      try {
        await unlink(BOOTSTRAP_CONFIG_FILE)
        console.log('Bootstrap config file deleted successfully')
      } catch (error) {
        console.log('Bootstrap config file not found or already deleted')
      }
      
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}

// Single health check attempt
async function attemptHealthCheck(port: number): Promise<boolean> {
  try {
    const response = await axios({
      method: 'GET',
      url: `http://localhost:${port}/api/health`,
      timeout: 5000,
      validateStatus: (status) => status === 200
    })
    
    // Validate response content
    if (response.data && response.data.status === 'ok') {
      console.log(`✅ Health check successful on port ${port}:`, response.data)
      return true
    } else {
      console.log(`⚠️ Unexpected health check response:`, response.data)
      return false
    }
    
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`🔍 Port ${port} not ready yet (connection refused)`)
    } else if (error.code === 'ECONNRESET') {
      console.log(`🔍 Port ${port} connection reset, service might be starting`)
    } else {
      console.log(`🔍 Health check failed on port ${port}:`, error.message)
    }
    return false
  }
} 