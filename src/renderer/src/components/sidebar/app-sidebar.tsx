import { useCallback, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Settings, Plus, MessageCircle, Video, Trash2, GripVertical, Server } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
} from '../ui/sidebar';
import { DragArea } from '../common/drag';
import { VideoRAGHeader } from './nav-header';
import { Button } from '../ui/button';
import { ToggleSwitch } from '../ui/toggle-switch';
import { useServiceContext } from '../../contexts/ServiceContext';
import { useChatSessionContext } from '../../contexts/ChatSessionContext';

interface ChatHistory {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
}

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  
  // VideoRAG service control
  const { 
    serviceState, 
    loading: serviceLoading, 
    loadImageBind,
    releaseImageBind
  } = useServiceContext();
  
  // Chat Session information management
  const sessionInfo = useChatSessionContext();
  
  // Debug information
  console.log('AppSidebar - Service State:', { 
    isRunning: serviceState.isRunning, 
    loading: serviceLoading,
    message: serviceState.message,
    error: serviceState.error
  });

  // Load chat history from session info
  useEffect(() => {
    if (sessionInfo.isLoading) return;
    
    // Build chat history based on session info
    const chatHistoryFromSessions = sessionInfo.sessions.map(session => ({
      id: session.id,
      title: session.title,
      lastMessage: session.lastMessage || 
        (session.analysisState === 'completed' 
          ? 'Video analysis completed - Ready for questions!'
          : session.analysisState === 'analyzing'
            ? 'Video analysis in progress...'
            : 'New chat session'),
      timestamp: session.lastUpdated,
    }));
    
    // Backend has handled sorting, use directly
    setChatHistory(chatHistoryFromSessions);
  }, [sessionInfo.isLoading, sessionInfo.sessions]);

  // Note: No longer need to listen to chatHistoryEvent, because now using context to share state
  // sidebar will automatically listen to changes in sessions through context

  const handleNewChat = useCallback(() => {
    const newChatId = `new`;
    navigate(`/chat/${newChatId}`);
  }, [navigate]);

  const handleChatSelect = useCallback(
    (chatId: string) => {
      // If dragging, do not process click
      if (draggedItem) {
        return;
      }
      
      // Ensure correct navigation and force reload
      navigate(`/chat/${chatId}`);

      // Add a small delay to ensure navigation is complete before triggering message load
      setTimeout(() => {
        const event = new CustomEvent('force-reload-chat', {
          detail: { chatId },
        });
        window.dispatchEvent(event);
      }, 100);
    },
    [navigate, draggedItem],
  );

  const handleDeleteChat = useCallback(
    (chatId: string, event: React.MouseEvent) => {
      event.stopPropagation(); // Prevent triggering chat selection

      const chatToDelete = chatHistory.find((chat) => chat.id === chatId);
      const chatTitle = chatToDelete?.title || 'Untitled Chat';

      // Confirm deletion
      if (
        confirm(
          `Are you sure you want to delete "${chatTitle}"?\n\nThis conversation and all its messages will be permanently removed.`,
        )
      ) {
        // Delete session info (this will automatically delete messages and chat history)
        sessionInfo.deleteSessionInfo(chatId);

        // If the deleted chat is the current chat, navigate to new chat
        const currentChatId = location.pathname.split('/')[2];
        if (currentChatId === chatId) {
          navigate('/chat/new');
        }
      }
    },
    [chatHistory, location.pathname, navigate, sessionInfo],
  );

  const handleSettingsClick = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  const formatTime = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const handleClearAllHistory = useCallback(() => {
    if (
      confirm(
        `Are you sure you want to clear all ${chatHistory.length} conversations?\n\nThis action cannot be undone and will permanently delete all chat history.`,
      )
    ) {
      // Clear all session info (this will automatically delete all messages and chat history)
      sessionInfo.clearAllSessions();

      // Navigate to new chat
      navigate('/chat/new');
    }
  }, [chatHistory, navigate, sessionInfo]);

  // Drag handling functions
  const handleDragStart = useCallback((e: React.DragEvent, chatId: string) => {
    setDraggedItem(chatId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', chatId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverItem(null);
    setDropPosition(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, chatId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedItem && draggedItem !== chatId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY;
      const midPoint = rect.top + rect.height / 2;
      
      setDragOverItem(chatId);
      setDropPosition(y < midPoint ? 'before' : 'after');
    }
  }, [draggedItem]);

  const handleDragEnter = useCallback((e: React.DragEvent, chatId: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem !== chatId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY;
      const midPoint = rect.top + rect.height / 2;
      
      setDragOverItem(chatId);
      setDropPosition(y < midPoint ? 'before' : 'after');
    }
  }, [draggedItem]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear dragOverItem when mouse truly leaves element
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverItem(null);
      setDropPosition(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetChatId: string) => {
    e.preventDefault();
    const sourceChatId = draggedItem;
    
    if (!sourceChatId || sourceChatId === targetChatId) {
      setDraggedItem(null);
      setDragOverItem(null);
      setDropPosition(null);
      return;
    }

    // Reorder session info
    const sessions = sessionInfo.sessions;
    const sourceSession = sessions.find(s => s.id === sourceChatId);
    const targetSession = sessions.find(s => s.id === targetChatId);
    
    if (sourceSession && targetSession) {
      const reorderedSessions = [...sessions];
      const sourceIndex = reorderedSessions.findIndex(s => s.id === sourceChatId);
      const targetIndex = reorderedSessions.findIndex(s => s.id === targetChatId);
      
      if (sourceIndex !== -1 && targetIndex !== -1) {
        // Move element
        const [movedSession] = reorderedSessions.splice(sourceIndex, 1);
        
        // Calculate insert position
        let insertIndex = targetIndex;
        if (sourceIndex < targetIndex) {
          insertIndex = targetIndex - 1;
        }
        
        // Adjust insert index based on drop position
        if (dropPosition === 'after') {
          insertIndex += 1;
        }
        
        reorderedSessions.splice(insertIndex, 0, movedSession);
        await sessionInfo.reorderSessions(reorderedSessions);
      }
    }

    setDraggedItem(null);
    setDragOverItem(null);
    setDropPosition(null);
  }, [draggedItem, dropPosition, sessionInfo]);

  const currentChatId = location.pathname.split('/')[2];

  return (
    <Sidebar collapsible="icon" className="select-none">
      <DragArea />
      <SidebarHeader>
        <VideoRAGHeader />

        {/* New Chat Button */}
        <div className="px-2 flex justify-center">
          <Button
            onClick={handleNewChat}
            className="min-w-[120px] max-w-[200px] w-full justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95"
          >
            <Plus size={16} />
            <span className="font-medium">New Chat</span>
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <div className="space-y-1">
          {chatHistory.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              <MessageCircle size={32} className="mx-auto mb-2 opacity-50" />
              <p>No chat history</p>
              <p className="text-xs">Start a new conversation</p>
            </div>
          ) : (
            <>
              {/* Drag Hint */}
              {chatHistory.length > 1 && !draggedItem && (
                <div className="text-xs text-gray-400 mb-2 px-2 flex items-center gap-1">
                  <GripVertical size={12} />
                  <span>Drag to reorder conversations</span>
                </div>
              )}
              
              {/* Clear All Button */}
              {chatHistory.length > 0 && (
                <div className="pb-2 mb-2 border-b border-gray-200">
                  <button
                    onClick={handleClearAllHistory}
                    className="w-full text-left text-xs text-gray-500 hover:text-red-600 transition-all duration-200 p-2 rounded-md hover:bg-red-50 flex items-center gap-2 group"
                    title={`Clear all ${chatHistory.length} conversations`}
                  >
                    <Trash2
                      size={12}
                      className="group-hover:scale-110 transition-transform duration-200"
                    />
                    Clear all history ({chatHistory.length})
                  </button>
                </div>
              )}

              {/* Top Drop Zone for first position */}
              {draggedItem && (
                <div 
                  className="h-4 -mx-2 px-2 flex items-center"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverItem('__TOP__');
                    setDropPosition('before');
                  }}
                  onDragLeave={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX;
                    const y = e.clientY;
                    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                      if (dragOverItem === '__TOP__') {
                        setDragOverItem(null);
                        setDropPosition(null);
                      }
                    }
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const sourceChatId = draggedItem;
                    if (sourceChatId) {
                      // Reorder session info
                      const sessions = sessionInfo.sessions;
                      const sourceSession = sessions.find(s => s.id === sourceChatId);
                      if (sourceSession) {
                        const filteredSessions = sessions.filter(s => s.id !== sourceChatId);
                        const reorderedSessions = [sourceSession, ...filteredSessions];
                        await sessionInfo.reorderSessions(reorderedSessions);
                      }
                    }
                    setDraggedItem(null);
                    setDragOverItem(null);
                    setDropPosition(null);
                  }}
                >
                  {dragOverItem === '__TOP__' && (
                    <div className="h-0.5 bg-blue-500 w-full rounded-full shadow-sm" />
                  )}
                </div>
              )}

              {/* History Items */}
              {chatHistory.map((chat) => (
                <div key={`chat-container-${chat.id}`} className="relative">
                  {/* Insert Line Before */}
                  {dragOverItem === chat.id && dropPosition === 'before' && (
                    <div className="h-0.5 bg-blue-500 mx-2 mb-1 rounded-full shadow-sm transition-all duration-200" />
                  )}
                  
                  <div
                    key={chat.id}
                    draggable
                    onClick={() => handleChatSelect(chat.id)}
                    onDragStart={(e) => handleDragStart(e, chat.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, chat.id)}
                    onDragEnter={(e) => handleDragEnter(e, chat.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, chat.id)}
                    className={`
                      group p-3 rounded-lg cursor-pointer transition-all duration-200 border relative select-none
                      ${currentChatId === chat.id ? 'bg-blue-50 border-blue-200' : 'border-transparent'}
                      ${draggedItem === chat.id ? 'opacity-50 scale-95 bg-gray-100 shadow-lg rotate-2' : ''}
                      ${!draggedItem ? 'hover:bg-gray-100' : ''}
                    `}
                    style={{
                      transformOrigin: 'center',
                    }}
                  >
                  <div className="flex items-start gap-2">
                    {/* Drag Handle */}
                    <div
                      className="drag-handle opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 mt-0.5 flex-shrink-0"
                      title="Drag to reorder"
                      onMouseDown={(e) => {
                        // Ensure drag handle can trigger parent element's drag
                        e.stopPropagation();
                      }}
                    >
                      <GripVertical size={14} />
                    </div>
                    
                    <Video
                      size={16}
                      className="text-blue-500 mt-0.5 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {chat.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {chat.lastMessage}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTime(chat.timestamp)}
                      </p>
                    </div>

                    {/* Delete Button - Shows on hover */}
                    <button
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-1.5 rounded-md hover:bg-red-100 hover:text-red-600 text-gray-400 hover:scale-110 active:scale-95"
                      title={`Delete "${chat.title}"`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  </div>
                  
                  {/* Insert Line After */}
                  {dragOverItem === chat.id && dropPosition === 'after' && (
                    <div className="h-0.5 bg-blue-500 mx-2 mt-1 rounded-full shadow-sm transition-all duration-200" />
                  )}
                </div>
              ))}

              {/* Bottom Drop Zone for last position */}
              {draggedItem && (
                <div 
                  className="h-4 -mx-2 px-2 flex items-center"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverItem('__BOTTOM__');
                    setDropPosition('after');
                  }}
                  onDragLeave={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX;
                    const y = e.clientY;
                    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                      if (dragOverItem === '__BOTTOM__') {
                        setDragOverItem(null);
                        setDropPosition(null);
                      }
                    }
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const sourceChatId = draggedItem;
                    if (sourceChatId) {
                      // Reorder session info (move to end)
                      const sessions = sessionInfo.sessions;
                      const sourceSession = sessions.find(s => s.id === sourceChatId);
                      if (sourceSession) {
                        const filteredSessions = sessions.filter(s => s.id !== sourceChatId);
                        const reorderedSessions = [...filteredSessions, sourceSession];
                        await sessionInfo.reorderSessions(reorderedSessions);
                      }
                    }
                    setDraggedItem(null);
                    setDragOverItem(null);
                    setDropPosition(null);
                  }}
                >
                  {dragOverItem === '__BOTTOM__' && (
                    <div className="h-0.5 bg-blue-500 w-full rounded-full shadow-sm" />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </SidebarContent>

      <SidebarFooter className="p-2 space-y-2">
        {/* Service Control */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Server size={16} className={`${serviceState.imagebindLoaded ? 'text-green-500' : 'text-gray-400'}`} />
              <span className="text-sm font-medium">
                Vimo Service
              </span>
            </div>
            <ToggleSwitch
              checked={serviceState.imagebindLoaded}
              onChange={async (checked) => {
                if (checked) {
                  await loadImageBind();
                } else {
                  await releaseImageBind();
                }
              }}
              disabled={serviceLoading.loadingImageBind || serviceLoading.releasingImageBind}
              size="sm"
            />
          </div>
          <div className="mt-2 text-xs text-gray-600">
            {serviceLoading.loadingImageBind && 'Loading Embedding model...'}
            {serviceLoading.releasingImageBind && 'Releasing Embedding model...'}
            {!serviceLoading.loadingImageBind && !serviceLoading.releasingImageBind && (
              serviceState.imagebindLoaded ? 'Ready for video processing' : (
                serviceState.isRunning ? (
                  <span className="text-yellow-600">
                    Click to load Embedding model
                  </span>
                ) : (
                  <span className="bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent font-medium">
                    Click to start
                  </span>
                )
              )
            )}
          </div>
        </div>
        
        <SidebarMenu>
          <SidebarMenuButton
            className="font-medium"
            onClick={handleSettingsClick}
            isActive={location.pathname === '/settings'}
          >
            <Settings />
            Settings
          </SidebarMenuButton>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
