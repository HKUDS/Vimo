import { useState } from 'react'



export interface ServiceState {
  isRunning: boolean
  imagebindLoaded: boolean
  message?: string
  error?: string
}

export const useVideoRAGService = () => {

  const [serviceState, setServiceState] = useState<ServiceState>({ 
    isRunning: false,
    imagebindLoaded: false
  })
  const [loading, setLoading] = useState({
    starting: false,
    stopping: false,
    checkingService: false,
    loadingImageBind: false,
    releasingImageBind: false
  })



  // Check service status
  const checkServiceStatus = async () => {
    setLoading(prev => ({ ...prev, checkingService: true }))
    try {
      const result = await window.api.videorag.systemStatus()
      if (result.success && result.data) {
        setServiceState(prev => ({
          ...prev,
          isRunning: result.data.total_sessions !== undefined || result.data.global_config_set,
          imagebindLoaded: result.data.imagebind_loaded || false,
          message: result.data.imagebind_loaded 
            ? 'Service ready for video processing' 
            : 'Service running - ImageBind not loaded'
        }))
      } else {
        setServiceState(prev => ({
          ...prev,
          isRunning: false,
          imagebindLoaded: false,
          error: result.error || 'Failed to get system status'
        }))
      }
    } catch (error) {
      setServiceState(prev => ({
        ...prev,
        isRunning: false,
        imagebindLoaded: false,
        error: 'Failed to check service status'
      }))
    } finally {
      setLoading(prev => ({ ...prev, checkingService: false }))
    }
  }

  // Start service
  const startService = async () => {
    setLoading(prev => ({ ...prev, starting: true }))
    try {
      const result = await window.api.videorag.startService()
      if (result.success) {
        setServiceState(prev => ({
          ...prev,
          isRunning: true,
          message: result.message
        }))
        // API returns success means service started successfully, no additional check needed
        return true
      } else {
        setServiceState(prev => ({
          ...prev,
          isRunning: false,
          error: result.error
        }))
        return false
      }
    } catch (error) {
      setServiceState(prev => ({
        ...prev,
        isRunning: false,
        error: 'Failed to start service'
      }))
      return false
    } finally {
      setLoading(prev => ({ ...prev, starting: false }))
    }
  }

  // Stop service
  const stopService = async () => {
    setLoading(prev => ({ ...prev, stopping: true }))
    try {
      const result = await window.api.videorag.stopService()
      if (result.success) {
        setServiceState(prev => ({
          ...prev,
          isRunning: false,
          message: result.message
        }))
        // API returns success means service stopped successfully, no additional check needed
        return true
      } else {
        setServiceState(prev => ({
          ...prev,
          isRunning: false,
          error: result.error
        }))
        return false
      }
    } catch (error) {
      setServiceState(prev => ({
        ...prev,
        isRunning: false,
        error: 'Failed to stop service'
      }))
      return false
    } finally {
      setLoading(prev => ({ ...prev, stopping: false }))
    }
  }

  // Load ImageBind model
  const loadImageBind = async () => {
    setLoading(prev => ({ ...prev, loadingImageBind: true }))
    try {
      const result = await window.api.videorag.loadImageBind()
      if (result.success) {
        setServiceState(prev => ({
          ...prev,
          imagebindLoaded: true,
          message: 'ImageBind model loaded successfully'
        }))
        return true
      } else {
        setServiceState(prev => ({
          ...prev,
          error: result.error
        }))
        return false
      }
    } catch (error) {
      setServiceState(prev => ({
        ...prev,
        error: 'Failed to load ImageBind model'
      }))
      return false
    } finally {
      setLoading(prev => ({ ...prev, loadingImageBind: false }))
    }
  }

  // Release ImageBind model
  const releaseImageBind = async () => {
    setLoading(prev => ({ ...prev, releasingImageBind: true }))
    try {
      const result = await window.api.videorag.releaseImageBind()
      if (result.success) {
        setServiceState(prev => ({
          ...prev,
          imagebindLoaded: false,
          message: 'ImageBind model released successfully'
        }))
        return true
      } else {
        setServiceState(prev => ({
          ...prev,
          error: result.error
        }))
        return false
      }
    } catch (error) {
      setServiceState(prev => ({
        ...prev,
        error: 'Failed to release ImageBind model'
      }))
      return false
    } finally {
      setLoading(prev => ({ ...prev, releasingImageBind: false }))
    }
  }

  // Check ImageBind status
  const checkImageBindStatus = async () => {
    try {
      const result = await window.api.videorag.imagebindStatus()
      if (result.success) {
        setServiceState(prev => ({
          ...prev,
          imagebindLoaded: result.data?.loaded || false
        }))
      }
    } catch (error) {
      console.error('Failed to check ImageBind status:', error)
    }
  }


  return {
    serviceState,
    loading,
    checkServiceStatus,
    startService,
    stopService,
    loadImageBind,
    releaseImageBind,
    checkImageBindStatus
  }
} 