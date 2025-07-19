import React, { createContext, useContext, ReactNode } from 'react';
import { useChatSessionInfo } from '../hooks/useChatSessionInfo';
import { ChatSessionInfo, UploadedVideo } from '../types/chat';

export interface ChatSessionContextType {
  sessions: ChatSessionInfo[];
  isLoading: boolean;
  createSessionInfo: (sessionId: string, title: string) => ChatSessionInfo | null;
  updateSessionInfo: (sessionId: string, updates: Partial<ChatSessionInfo>) => void;
  startAnalysis: (sessionId: string, videos: UploadedVideo[]) => void;
  updateAnalysisProgress: (sessionId: string, progress: number, currentStep: string) => void;
  completeAnalysis: (sessionId: string) => void;
  deleteSessionInfo: (sessionId: string) => void;
  getSessionInfo: (sessionId: string) => ChatSessionInfo | null;
  reorderSessions: (reorderedSessions: ChatSessionInfo[]) => void;
  clearAllSessions: () => void;
  loadSessionsFromStorage: () => Promise<void>;
}

const ChatSessionContext = createContext<ChatSessionContextType | null>(null);

interface ChatSessionProviderProps {
  children: ReactNode;
}

export const ChatSessionProvider: React.FC<ChatSessionProviderProps> = ({ children }) => {
  const sessionInfo = useChatSessionInfo();

  return (
    <ChatSessionContext.Provider value={sessionInfo}>
      {children}
    </ChatSessionContext.Provider>
  );
};

export const useChatSessionContext = (): ChatSessionContextType => {
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error('useChatSessionContext must be used within a ChatSessionProvider');
  }
  return context;
}; 