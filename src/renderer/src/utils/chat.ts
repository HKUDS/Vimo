import { Message } from '../types/chat';

/**
 * Format file size
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Automatically classify messages
 */
const categorizeMessage = (message: Message): Message => {
  const categorized = { ...message };
  
  if (message.type === 'user') {
    categorized.messageCategory = 'user_query';
  } else if (message.type === 'assistant') {
    if (message.isProgressBar) {
      categorized.messageCategory = 'analysis_status';
    } else if (message.content.includes('VideoRAG') || message.content.includes('System')) {
      categorized.messageCategory = 'system_info';
    } else {
      categorized.messageCategory = 'assistant_response';
    }
  }
  
  return categorized;
};

/**
 * Add a single message to the file system (read JSON → add message → save JSON)
 */
export const addMessage = async (chatId: string, newMessage: Message): Promise<void> => {
  if (chatId && chatId !== 'new') {
    try {
      // Step 1: First read the JSON file of the current session
      const result = await window.api.chatSessions.load(chatId);
      const sessionData = result.session || {
        id: chatId,
        title: 'New Chat',
        createdAt: new Date(),
        lastUpdated: new Date(),
        videos: [],
        analysisState: 'none',
        lastMessage: '',
        messages: [],
      };
      
      // Step 2: Add the new message to the existing chat record
      const existingMessages = sessionData.messages || [];
      const categorizedMessage = categorizeMessage(newMessage);
      const updatedMessages = [...existingMessages, categorizedMessage];
      
      // Step 3: Save JSON file
      const updatedSession = {
        ...sessionData,
        messages: updatedMessages,
        lastMessage: newMessage.content.length > 50 ? newMessage.content.substring(0, 50) + '...' : newMessage.content,
        lastUpdated: new Date(),
      };
      
      await window.api.chatSessions.save(chatId, updatedSession);
      
      // Step 4: Trigger frontend interface refresh
      window.dispatchEvent(new CustomEvent('chat-messages-updated', { detail: { chatId } }));
    } catch (error) {
      console.error('Failed to add message:', error);
    }
  }
};

/**
 * Update existing messages (used for updating progress bars, etc.)
 */
export const updateMessage = async (chatId: string, messageId: string, updates: Partial<Message>): Promise<void> => {
  if (chatId && chatId !== 'new') {
    try {
      // Step 1: Read JSON file
      const result = await window.api.chatSessions.load(chatId);
      if (!result.session?.messages) return;
      
      // Step 2: Update specified message
      const updatedMessages = result.session.messages.map((msg: any) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      );
      
      // Step 3: Save JSON file
      const updatedSession = {
        ...result.session,
        messages: updatedMessages,
        lastUpdated: new Date(),
      };
      
      await window.api.chatSessions.save(chatId, updatedSession);
      
      // Step 4: Trigger frontend interface refresh
      window.dispatchEvent(new CustomEvent('chat-messages-updated', { detail: { chatId } }));
    } catch (error) {
      console.error('Failed to update message:', error);
    }
  }
};

/**
 * Directly save the complete message array to the file system (backward compatibility)
 */
export const saveMessages = async (chatId: string, messages: Message[]): Promise<void> => {
  if (chatId && chatId !== 'new') {
    const categorizedMessages = messages.map(categorizeMessage);
    const lastMessage = messages.length > 0 ? messages[messages.length - 1].content : '';
    
    try {
      // First load the current session info, keep other fields
      const result = await window.api.chatSessions.load(chatId);
      const sessionData = result.session || {
        id: chatId,
        title: 'New Chat',
        createdAt: new Date(),
        lastUpdated: new Date(),
        videos: [],
        analysisState: 'none',
        lastMessage: '',
      };
      
      // Only update messages and lastMessage, keep other fields unchanged
      const updatedSession = {
        ...sessionData,
        messages: categorizedMessages,
        lastMessage: lastMessage.length > 50 ? lastMessage.substring(0, 50) + '...' : lastMessage,
        lastUpdated: new Date(),
      };
      
      await window.api.chatSessions.save(chatId, updatedSession);
      
      // Trigger frontend interface refresh
      window.dispatchEvent(new CustomEvent('chat-messages-updated', { detail: { chatId } }));
    } catch (error) {
      console.error('Failed to save messages:', error);
    }
  }
};

/**
 * Directly load messages from the file system
 */
export const loadMessages = async (chatId: string): Promise<Message[]> => {
  if (chatId && chatId !== 'new') {
    try {
      const result = await window.api.chatSessions.load(chatId);
      if (result.success && result.session?.messages) {
        return result.session.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }
  return [];
};

/**
 * Generate a unique message ID
 */
export const generateMessageId = (): string => `msg-${Date.now()}`;

/**
 * Generate a unique video ID
 */
export const generateVideoId = (): string => `video-${Date.now()}-${Math.random()}`;

/**
 * Generate a unique chat ID
 */
export const generateChatId = (): string => `chat-${Date.now()}`;

/**
 * Get welcome message
 */
export const getWelcomeMessage = (): Message => ({
  id: 'welcome',
  type: 'assistant',
  content: "Hello! I'm Vimo, your AI assistant for video analysis. Upload videos and ask me anything about them - I can analyze content, summarize key points, and answer questions about what I see.",
  timestamp: new Date(),
});

/**
 * Update the lastMessage in the session info (does not affect the messages array)
 */
export const updateSessionLastMessage = async (chatId: string, lastMessage: string): Promise<void> => {
  if (chatId && chatId !== 'new') {
    try {
      const result = await window.api.chatSessions.load(chatId);
      if (result.success && result.session) {
        const updatedSession = {
          ...result.session,
          lastMessage: lastMessage.length > 50 ? lastMessage.substring(0, 50) + '...' : lastMessage,
          lastUpdated: new Date(),
        };
        await window.api.chatSessions.save(chatId, updatedSession);
      }
    } catch (error) {
      console.error('Failed to update session last message:', error);
    }
  }
};

/**
 * Create chat history update event
 */
export const createChatHistoryEvent = (chatId: string, title: string, lastMessage: string) => {
  return new CustomEvent('chat-history-update', {
    detail: { chatId, title, lastMessage },
  });
}; 