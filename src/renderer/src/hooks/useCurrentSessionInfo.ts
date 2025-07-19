import { useState, useEffect, useCallback } from 'react';
import { ChatSessionInfo } from '../types/chat';

interface UseCurrentSessionInfoReturn {
  sessionInfo: ChatSessionInfo | null;
  isLoading: boolean;
  error: string | null;
  refreshSessionInfo: () => Promise<void>;
}

export const useCurrentSessionInfo = (chatId: string | undefined): UseCurrentSessionInfoReturn => {
  const [sessionInfo, setSessionInfo] = useState<ChatSessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current session info directly from JSON file
  const loadCurrentSessionInfo = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId === 'new') {
      setSessionInfo(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const result = await window.api.chatSessions.load(sessionId);
      
      if (result.success && result.session) {
        const sessionWithDates: ChatSessionInfo = {
          ...result.session,
          createdAt: new Date(result.session.createdAt),
          lastUpdated: new Date(result.session.lastUpdated),
        };
        setSessionInfo(sessionWithDates);
      } else {
        setSessionInfo(null);
      }
    } catch (err) {
      console.error('Failed to load current session info:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSessionInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh session info
  const refreshSessionInfo = useCallback(async () => {
    if (chatId) {
      await loadCurrentSessionInfo(chatId);
    }
  }, [chatId, loadCurrentSessionInfo]);

  // When chatId changes, reload session info
  useEffect(() => {
    if (chatId) {
      loadCurrentSessionInfo(chatId);
    } else {
      setSessionInfo(null);
      setIsLoading(false);
    }
  }, [chatId, loadCurrentSessionInfo]);

  // Listen for session update events
  useEffect(() => {
    const handleSessionUpdate = (event: CustomEvent) => {
      const { chatId: updatedChatId } = event.detail;
      if (updatedChatId === chatId) {
        // Reload session info from JSON file
        refreshSessionInfo();
      }
    };

    // Listen for chat message update events
    window.addEventListener('chat-messages-updated', handleSessionUpdate as EventListener);
    // Listen for session info update events (e.g. analysis status, video list, etc.)
    window.addEventListener('session-info-updated', handleSessionUpdate as EventListener);
    
    return () => {
      window.removeEventListener('chat-messages-updated', handleSessionUpdate as EventListener);
      window.removeEventListener('session-info-updated', handleSessionUpdate as EventListener);
    };
  }, [chatId, refreshSessionInfo]);

  return {
    sessionInfo,
    isLoading,
    error,
    refreshSessionInfo,
  };
}; 