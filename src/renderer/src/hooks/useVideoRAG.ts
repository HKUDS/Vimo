import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router'

export interface VideoIndexStatus {
  video_name: string
  status: 'processing' | 'completed' | 'error'
  current_step: string
  message: string
}

export interface VideoRAGConfig {
  ali_dashscope_api_key: string
  ali_dashscope_base_url: string
  openai_api_key: string
  openai_base_url: string
  image_bind_model_path: string
  base_storage_path?: string
}

export interface QueryResponse {
  success: boolean
  query: string
  response: string
  mode: string
  timestamp: number
}

export interface SystemStatus {
  global_config_set: boolean
  total_sessions: number
  total_indexed_videos: number
  processing_videos: string[]
  sessions: string[]
}

export interface SessionStatus {
  session_exists: boolean
  chat_id: string
  indexed_videos_count: number
  processing_videos: string[]
  working_dir: string
  available_for_query: boolean
}

interface UseVideoRAGReturn {
  // System status
  systemStatus: SystemStatus | null
  sessionStatus: SessionStatus | null
  
  // Video management
  indexedVideos: string[]
  processingVideos: string[]
  videoStatus: Record<string, VideoIndexStatus>
  
  // API operations
  initialize: (config: VideoRAGConfig) => Promise<boolean>

  uploadVideo: (videoPath: string, baseStoragePath: string) => Promise<boolean>
  refreshStatus: () => Promise<void>
  
  // Loading states
  loading: {
    initializing: boolean
    uploading: boolean
    refreshing: boolean
  }
  
  // Error handling
  error: string | null
  clearError: () => void
}

export function useVideoRAG(): UseVideoRAGReturn {
  const { chatId } = useParams()
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)
  const [indexedVideos, setIndexedVideos] = useState<string[]>([])
  const [processingVideos, setProcessingVideos] = useState<string[]>([])
  const [videoStatus, setVideoStatus] = useState<Record<string, VideoIndexStatus>>({})
  const [error, setError] = useState<string | null>(null)
  
  const [loading, setLoading] = useState({
    initializing: false,

    uploading: false,
    refreshing: false
  })

  // Clear error
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Set global configuration
  const initialize = useCallback(async (config: VideoRAGConfig): Promise<boolean> => {
    try {
      setLoading(prev => ({ ...prev, initializing: true }))
      setError(null)
      
      const result = await window.api.invoke('videorag:initialize', config)
      
      if (result.success) {
        await refreshStatus()
        return true
      } else {
        setError(result.error || 'Failed to set global configuration')
        return false
      }
    } catch (err: any) {
      setError(err.message || 'Failed to set global configuration')
      return false
    } finally {
      setLoading(prev => ({ ...prev, initializing: false }))
    }
  }, [])



  // Upload and index video(s) for current session
  const uploadVideo = useCallback(async (videoPath: string, baseStoragePath: string): Promise<boolean> => {
    if (!chatId) return false
    
    try {
      setLoading(prev => ({ ...prev, uploading: true }))
      setError(null)
      
      // Convert single video path to array for the new API
      const result = await window.api.videorag.uploadVideo(chatId, [videoPath], baseStoragePath)
      
      if (result.success) {
        // Processing started successfully
        return true
      } else {
        setError(result.error || 'Failed to upload video')
        return false
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload video')
      return false
    } finally {
      setLoading(prev => ({ ...prev, uploading: false }))
    }
  }, [chatId])

  // Query functionality will be added later
  // For now, we focus on upload and indexing

  // Refresh system and session status
  const refreshStatus = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, refreshing: true }))
      
      // Get global system status
      const systemResult = await window.api.invoke('videorag:system-status')
      if (systemResult.success) {
        setSystemStatus(systemResult.data)
      }
      
      // Get session-specific status if chatId exists
      if (chatId) {
        const sessionResult = await window.api.invoke('videorag:session-status', chatId)
        if (sessionResult.success) {
          setSessionStatus(sessionResult.data)
          
          if (sessionResult.data.session_exists) {
            setProcessingVideos(sessionResult.data.processing_videos)
            
            // Get indexed videos for this session
            const videosResult = await window.api.invoke('videorag:list-indexed', chatId)
            if (videosResult.success) {
              setIndexedVideos(videosResult.data.indexed_videos)
            }
          } else {
            setIndexedVideos([])
            setProcessingVideos([])
          }
        }
      }
      
    } catch (err: any) {
      console.error('Failed to refresh status:', err)
    } finally {
      setLoading(prev => ({ ...prev, refreshing: false }))
    }
  }, [chatId])

  // Poll video status for processing videos
  const pollVideoStatus = useCallback(async (videoName: string) => {
    if (!chatId) return
    
    const checkStatus = async () => {
      try {
        const result = await window.api.invoke('videorag:get-status', chatId, videoName)
        
        if (result.success) {
          const status = result.data as VideoIndexStatus
          
          setVideoStatus(prev => ({
            ...prev,
            [videoName]: status
          }))
          
          if (status.status === 'completed') {
            setProcessingVideos(prev => prev.filter(v => v !== videoName))
            setIndexedVideos(prev => [...prev.filter(v => v !== videoName), videoName])
          } else if (status.status === 'error') {
            setProcessingVideos(prev => prev.filter(v => v !== videoName))
            setError(`Video ${videoName} indexing failed: ${status.message}`)
          } else if (status.status === 'processing') {
            // Continue polling after 2 seconds
            setTimeout(checkStatus, 2000)
          }
        }
      } catch (err) {
        console.error('Failed to check video status:', err)
      }
    }
    
    checkStatus()
  }, [chatId])

  // Check health and initial status on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const result = await window.api.invoke('videorag:health-check')
        if (result.success) {
          await refreshStatus()
        }
      } catch (err) {
        console.error('VideoRAG health check failed:', err)
      }
    }
    
    checkHealth()
  }, [refreshStatus])

  // Poll processing videos status
  useEffect(() => {
    processingVideos.forEach(videoName => {
      if (!videoStatus[videoName] || videoStatus[videoName].status === 'processing') {
        pollVideoStatus(videoName)
      }
    })
  }, [processingVideos, videoStatus, pollVideoStatus])

  return {
    systemStatus,
    sessionStatus,
    indexedVideos,
    processingVideos,
    videoStatus,
    initialize,

    uploadVideo,
    refreshStatus,
    loading,
    error,
    clearError
  }
} 