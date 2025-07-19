import React, { useState } from 'react';
import { useParams } from 'react-router';
import { useChat } from '../../hooks/useChat';
import { useVideoUpload } from '../../hooks/useVideoUpload';
import { useResizable } from '../../hooks/useResizable';
import { useCurrentSessionInfo } from '../../hooks/useCurrentSessionInfo';
import { useServiceContext } from '../../contexts/ServiceContext';
import { MessageList } from '../../components/chat/MessageList';
import { WelcomeScreen } from '../../components/chat/WelcomeScreen';
import { ChatInput } from '../../components/chat/ChatInput';
import { VideoSelectionBar } from '../../components/common/VideoSelectionBar';
import { CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

const Chat = () => {
  const { chatId } = useParams();
  const chat = useChat();
  const resize = useResizable(150);
  const { serviceState, loading: serviceLoading } = useServiceContext();
  
  // Directly read current session info from JSON file (used for VideoSelectionBar)
  const { sessionInfo: currentSessionFromFile} = useCurrentSessionInfo(chatId);
  
  // Toast status management
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
  }>({
    show: false,
    message: '',
    type: 'info'
  });

  const showToast = (message: string, type: 'info' | 'warning' | 'error' | 'success') => {
    setToast({ show: true, message, type });
    // Automatically hide after 3 seconds
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  const videoUpload = useVideoUpload({
    uploadedVideos: chat.uploadedVideos,
    setUploadedVideos: chat.setUploadedVideos,
    onShowToast: showToast,
  });

  const isNewChat = chat.messages.length === 0 && !chat.analysisState.isAnalyzing;
  // If ImageBind is loaded and not in operation, allow video operations
  const isServiceReady = serviceState.imagebindLoaded && !serviceLoading.loadingImageBind && !serviceLoading.releasingImageBind;
  
  // Simplify logic: use memory state, determine whether to display VideoSelectionBar based on the number of videos
  const shouldShowVideoBar = chat.uploadedVideos.length > 0 || chat.analysisState.selectedVideos.length > 0;

  // New: independent state judgment based on the current session, avoiding session pollution
  const currentSessionAnalysisState = React.useMemo(() => {
    // Prioritize using memory state (real-time state)
    if (chat.analysisState.isAnalyzing) {
      return { isAnalyzing: true, isCompleted: false };
    }
    
    // If not in analysis, check persistent state
    if (currentSessionFromFile?.analysisState === 'completed') {
      return { isAnalyzing: false, isCompleted: true };
    }
    
    if (currentSessionFromFile?.analysisState === 'analyzing') {
      return { isAnalyzing: true, isCompleted: false };
    }
    
    // Default state: new session or not started analysis
    return { isAnalyzing: false, isCompleted: false };
  }, [chat.analysisState.isAnalyzing, currentSessionFromFile?.analysisState]);

  // Debug: add debug information
  console.log('VideoSelectionBar Debug:', {
    chatId,
    uploadedVideosLength: chat.uploadedVideos.length,
    selectedVideosLength: chat.analysisState.selectedVideos.length,
    shouldShowVideoBar,
    isNewChat,
    currentSessionAnalysisState,
    messagesLength: chat.messages.length,
  });

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header Area */}
      <div
        className="draggable-area h-8 w-full bg-white flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' as any, userSelect: 'none' } as React.CSSProperties}
      />

      {/* Main Content Area - Use remaining height */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Video Selection Bar - Overlay on top */}
        {shouldShowVideoBar && (
          <div className="absolute top-0 left-0 right-0 z-50 bg-white shadow-lg">
            <VideoSelectionBar
              videos={chat.analysisState.isAnalyzing || chat.analysisState.selectedVideos.length > 0
                ? chat.analysisState.selectedVideos
                : chat.uploadedVideos}
              onRemoveVideo={videoUpload.removeVideo}
              onStartAnalysis={chat.handleStartAnalysis}
              formatFileSize={videoUpload.formatFileSize}
              isServiceReady={isServiceReady}
              isAnalyzing={currentSessionAnalysisState.isAnalyzing}
              analysisCompleted={currentSessionAnalysisState.isCompleted}
            />
          </div>
        )}
        {isNewChat && !currentSessionAnalysisState.isAnalyzing ? (
          <WelcomeScreen 
            onVideoUpload={videoUpload.handleVideoUpload}
            uploadedVideos={chatId === 'new' || !currentSessionFromFile || currentSessionFromFile.analysisState === 'none' 
              ? chat.uploadedVideos 
              : []}
            onRemoveVideo={videoUpload.removeVideo}
            onStartAnalysis={chat.handleStartAnalysis}
            formatFileSize={videoUpload.formatFileSize}
            analysisState={chat.analysisState}
          />
        ) : (
          <div className="flex-1 overflow-hidden">
            <MessageList messages={chat.messages} isLoading={chat.isLoading} />
          </div>
        )}
      </div>

      {/* Input Area - Fixed at bottom - Show when there are messages or during analysis */}
      {chat.messages.length > 0 || currentSessionAnalysisState.isAnalyzing ? (
        <div className="flex-shrink-0">
          <ChatInput
            inputValue={chat.inputValue}
            setInputValue={chat.setInputValue}
            onVideoUpload={videoUpload.handleVideoUpload}
            onSendMessage={chat.handleSendMessage}
            isLoading={chat.isLoading}
            height={resize.getCurrentHeight()}
            onResizeMouseDown={resize.handleResizeMouseDown}
            isAnalyzing={currentSessionAnalysisState.isAnalyzing}
            isQueryProcessing={chat.isQueryProcessing}
          />
        </div>
      ) : null}

      {/* Toast prompt */}
      {toast.show && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div className={`px-6 py-4 rounded-lg shadow-lg border animate-in slide-in-from-right-5 duration-300 ${
            toast.type === 'success' ? 'bg-green-500 border-green-400 text-white' :
            toast.type === 'info' ? 'bg-blue-500 border-blue-400 text-white' :
            toast.type === 'warning' ? 'bg-yellow-500 border-yellow-400 text-white' :
            'bg-red-500 border-red-400 text-white'
          }`}>
            <div className="flex items-center gap-3">
              {toast.type === 'success' && <CheckCircle className="w-6 h-6" />}
              {toast.type === 'info' && <Info className="w-6 h-6" />}
              {toast.type === 'warning' && <AlertTriangle className="w-6 h-6" />}
              {toast.type === 'error' && <X className="w-6 h-6" />}
              <div className="flex-1">
                <div className="font-medium text-sm">{toast.message}</div>
              </div>
              <button
                onClick={() => setToast(prev => ({ ...prev, show: false }))}
                className="hover:opacity-75 ml-2"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
