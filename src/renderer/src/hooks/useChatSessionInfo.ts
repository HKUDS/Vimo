import { useState, useEffect, useCallback } from 'react';
import { ChatSessionInfo, UploadedVideo } from '../types/chat';

export const useChatSessionInfo = () => {
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load all chat session info from file system
  const loadSessionsFromStorage = useCallback(async () => {
    try {
      // Check if storage directory is configured
      const storageInfo = await window.api.chatSessions.getStorageInfo();
      if (!storageInfo.success || !storageInfo.storeDirectory) {
        console.log('📁 Storage directory not configured, skipping sessions load');
        setSessions([]);
        setIsLoading(false);
        return;
      }

      const result = await window.api.chatSessions.list();
      if (result.success && result.sessions) {
        const sessionsWithDates = result.sessions.map((session: any) => ({
          ...session,
          createdAt: new Date(session.createdAt),
          lastUpdated: new Date(session.lastUpdated),
        }));
        setSessions(sessionsWithDates);
        console.log(`📁 Loaded ${sessionsWithDates.length} chat sessions from storage`);
      } else {
        // Get failed, use empty array
        console.log('📁 Failed to load sessions or no sessions found');
        setSessions([]);
      }
    } catch (error) {
      console.error('Failed to load chat sessions info:', error);
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save single session to file system
  const saveSessionToStorage = useCallback(async (sessionData: ChatSessionInfo) => {
    try {
      const result = await window.api.chatSessions.save(sessionData.id, sessionData);
      if (!result.success) {
        console.error('Failed to save chat session:', result.error);
      }
    } catch (error) {
      console.error('Failed to save chat session:', error);
    }
  }, []);

  // Delete single session from file system
  const deleteSessionFromStorage = useCallback(async (sessionId: string) => {
    try {
      // 1. Try to clean up VideoRAG backend resources
      try {
        await window.api.videorag.deleteSession(sessionId);
      } catch (error) {
        console.warn('VideoRAG backend cleanup failed:', error);
      }
      
      // 2. Delete frontend JSON file
      const result = await window.api.chatSessions.delete(sessionId);
      if (!result.success) {
        console.error('Failed to delete chat session:', result.error);
      }
    } catch (error) {
      console.error('Failed to delete chat session:', error);
    }
  }, []);

  // 创建新的chat session info
  const createSessionInfo = useCallback((sessionId: string, title: string) => {
    // 防护措施：不允许创建 "new" 的 session
    if (sessionId === 'new') {
      console.warn('❌ Attempted to create session with reserved ID "new", skipping...');
      return null;
    }

    const newSession: ChatSessionInfo = {
      id: sessionId,
      title,
      createdAt: new Date(),
      lastUpdated: new Date(),
      videos: [],
      analysisState: 'none',
      lastMessage: '',
    };

    // Update sessions in memory
    setSessions(prev => [newSession, ...prev]);

    // Save to file system
    saveSessionToStorage(newSession);

    return newSession;
  }, [saveSessionToStorage]);

  // Update session info (keep existing messages)
  const updateSessionInfo = useCallback(async (sessionId: string, updates: Partial<ChatSessionInfo>) => {
    setSessions(prev => {
      const updated = prev.map(session => 
        session.id === sessionId 
          ? { ...session, ...updates, lastUpdated: new Date() }
          : session
      );
      return updated;
    });
    
    // Save updated session to file system, but keep existing messages
    try {
      const result = await window.api.chatSessions.load(sessionId);
      const currentSessionData = result.session || {
        id: sessionId,
        title: 'New Chat',
        createdAt: new Date(),
        lastUpdated: new Date(),
        videos: [],
        analysisState: 'none',
        lastMessage: '',
        messages: [],
      };
      
      // Only update specified fields, keep messages
      const updatedSession = {
        ...currentSessionData,
        ...updates,
        lastUpdated: new Date(),
      };
      
      await window.api.chatSessions.save(sessionId, updatedSession);
      
      // Trigger session info update event, notify VideoSelectionBar and other components to update
      window.dispatchEvent(new CustomEvent('session-info-updated', { detail: { chatId: sessionId } }));
    } catch (error) {
      console.error('Failed to update session info:', error);
    }
  }, []);

  // Start video analysis
  const startAnalysis = useCallback((sessionId: string, videos: UploadedVideo[]) => {
    updateSessionInfo(sessionId, {
      videos,
      analysisState: 'analyzing',
      analysisProgress: 0,
      currentStep: 'Initializing',
    });
  }, [updateSessionInfo]);

  // Update analysis progress
  const updateAnalysisProgress = useCallback((sessionId: string, progress: number, currentStep: string) => {
    updateSessionInfo(sessionId, {
      analysisProgress: progress,
      currentStep,
    });
  }, [updateSessionInfo]);

  // Complete analysis
  const completeAnalysis = useCallback((sessionId: string) => {
    updateSessionInfo(sessionId, {
      analysisState: 'completed',
      analysisProgress: 100,
      currentStep: 'Completed',
    });
  }, [updateSessionInfo]);

  // Delete session info
  const deleteSessionInfo = useCallback((sessionId: string) => {
    // 1. Immediately notify the session to stop polling
    window.dispatchEvent(new CustomEvent('session-deleted', { detail: { chatId: sessionId } }));
    
    // 2. Remove from memory
    setSessions(prev => prev.filter(session => session.id !== sessionId));
    
    // 3. Delete from file system
    deleteSessionFromStorage(sessionId);
  }, [deleteSessionFromStorage]);

  // Get session info by ID
  const getSessionInfo = useCallback((sessionId: string): ChatSessionInfo | null => {
    return sessions.find(session => session.id === sessionId) || null;
  }, [sessions]);

  // Reorder sessions (used for sidebar drag)
  const reorderSessions = useCallback(async (reorderedSessions: ChatSessionInfo[]) => {
    // 1. Immediately update memory state (frontend temporary rendering data)
    setSessions(reorderedSessions);
    
    // 2. Save sorted to backend configuration file (permanent storage)
    try {
      const sessionOrder = reorderedSessions.map(session => session.id);
      const result = await window.api.chatSessions.updateSessionOrder(sessionOrder, 'reorder');
      if (result.success) {
        console.log('✅ Session order saved successfully');
      } else {
        console.error('Failed to save session order:', result.error);
      }
    } catch (error) {
      console.error('Failed to save session order:', error);
    }
  }, []);

  // Clear all session info
  const clearAllSessions = useCallback(async () => {
    // Use deleteSessionInfo to ensure sending polling stop notification
    for (const session of sessions) {
      // 1. Immediately notify the session to stop polling
      window.dispatchEvent(new CustomEvent('session-deleted', { detail: { chatId: session.id } }));
      // 2. Delete file
      await deleteSessionFromStorage(session.id);
    }
    // Clear memory
    setSessions([]);
  }, [sessions, deleteSessionFromStorage]);

  // Listen for storage directory configuration changes
  useEffect(() => {
    const handleStorageConfigChange = () => {
      loadSessionsFromStorage();
    };

    window.addEventListener('storage-config-updated', handleStorageConfigChange as EventListener);
    return () => {
      window.removeEventListener('storage-config-updated', handleStorageConfigChange as EventListener);
    };
  }, [loadSessionsFromStorage]);

  // Load data when initializing
  useEffect(() => {
    loadSessionsFromStorage();
  }, [loadSessionsFromStorage]);

  // Listen for session info update events
  useEffect(() => {
    const handleSessionInfoUpdate = () => {
      loadSessionsFromStorage();
    };

    window.addEventListener('chat-messages-updated', handleSessionInfoUpdate as EventListener);
    return () => {
      window.removeEventListener('chat-messages-updated', handleSessionInfoUpdate as EventListener);
    };
  }, [loadSessionsFromStorage]);

  return {
    sessions,
    isLoading,
    createSessionInfo,
    updateSessionInfo,
    startAnalysis,
    updateAnalysisProgress,
    completeAnalysis,
    deleteSessionInfo,
    getSessionInfo,
    reorderSessions,
    clearAllSessions,
    loadSessionsFromStorage,
  };
}; 