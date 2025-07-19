import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Message, UploadedVideo, VideoAnalysisState, AnalysisStep } from '../types/chat';
import {
  loadMessages,
  addMessage,
  updateMessage,
  generateMessageId,
  generateChatId,
} from '../utils/chat';
import { useVideoRAG } from './useVideoRAG';
import { useChatSessionContext } from '../contexts/ChatSessionContext';

export const useChat = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isQueryProcessing, setIsQueryProcessing] = useState(false);
  const [analysisState, setAnalysisState] = useState<VideoAnalysisState>({
    isAnalyzing: false,
    progress: 0,
    currentStep: 'Initializing',
    selectedVideos: [],
  });
  
  const { 
    sessionStatus, 
    indexedVideos,
    processingVideos,
    videoStatus,
    error: videoragError
  } = useVideoRAG();

  // Integrate Chat Session information management system
  const sessionInfo = useChatSessionContext();

  // Intelligent polling management
  const [activePolling, setActivePolling] = useState<NodeJS.Timeout | null>(null);



  // Load chat messages and session info
  useEffect(() => {
    if (!chatId || sessionInfo.isLoading) return;

    // Load messages directly from file system
    const loadChatMessages = async () => {
      const messages = await loadMessages(chatId);
      setMessages(messages);
    };

    // Load video state from JSON file to memory - remove sessionInfo.sessions dependency
    const loadVideoStateFromJSON = async () => {
      if (chatId === 'new') {
        // New chat does not clear uploaded videos, keep temporary state
        // Only clear uploaded videos when first entering or switching from other sessions to new
        console.log('📂 New chat: preserving temporary uploaded videos');
        setAnalysisState({
          isAnalyzing: false,
          progress: 0,
          currentStep: 'Initializing',
          selectedVideos: [],
        });
        return;
      }

      // Existing session: load video state from JSON file to memory
      const currentSessionInfo = sessionInfo.getSessionInfo(chatId);
      if (currentSessionInfo && currentSessionInfo.videos.length > 0) {
        // Load video data from JSON file to memory state as temporary working state
        console.log('📂 Loading videos from JSON to memory for session:', chatId, currentSessionInfo.videos);
        setUploadedVideos([...currentSessionInfo.videos]);
        
        // Restore analysis state
        setAnalysisState({
          isAnalyzing: currentSessionInfo.analysisState === 'analyzing',
          progress: currentSessionInfo.analysisProgress || 0,
          currentStep: currentSessionInfo.currentStep || 'Initializing',
          selectedVideos: currentSessionInfo.videos,
        });
      } else {
        // Existing session but no videos: clear memory state
        setUploadedVideos([]);
        setAnalysisState({
          isAnalyzing: false,
          progress: 0,
          currentStep: 'Initializing',
          selectedVideos: [],
        });
      }
    };

    // Load messages and video state simultaneously
    Promise.all([
      loadChatMessages(),
      loadVideoStateFromJSON()
    ]);
  }, [chatId, sessionInfo.isLoading]); // Remove sessionInfo.sessions dependency

  // Listen for chat messages updates
  useEffect(() => {
    const handleMessagesUpdate = (event: CustomEvent) => {
      const { chatId: updatedChatId } = event.detail;
      if (updatedChatId && updatedChatId === chatId) {
        // Reload messages from file system to refresh interface
        const reloadMessages = async () => {
          const messages = await loadMessages(updatedChatId);
          setMessages(messages);
        };
        reloadMessages();
      }
    };

    const handleForceReload = (event: CustomEvent) => {
      const { chatId: reloadChatId } = event.detail;
      if (reloadChatId && reloadChatId === chatId) {
        // Reload messages from file system
        const reloadMessages = async () => {
          const messages = await loadMessages(reloadChatId);
          setMessages(messages);
        };
        reloadMessages();
      }
    };

    const handleSessionDeleted = (event: CustomEvent) => {
      const { chatId: deletedChatId } = event.detail;
      if (deletedChatId && deletedChatId === chatId) {
        console.log('🛑 Session deleted, stopping polling immediately for:', deletedChatId);
        // Immediately stop polling (user will be navigated to new page, no need to reset state)
        if (activePolling) {
          clearTimeout(activePolling);
          setActivePolling(null);
          console.log('🛑 Polling stopped due to session deletion');
        }
      }
    };

    window.addEventListener('chat-messages-updated', handleMessagesUpdate as EventListener);
    window.addEventListener('force-reload-chat', handleForceReload as EventListener);
    window.addEventListener('session-deleted', handleSessionDeleted as EventListener);
    return () => {
      window.removeEventListener('chat-messages-updated', handleMessagesUpdate as EventListener);
      window.removeEventListener('force-reload-chat', handleForceReload as EventListener);
      window.removeEventListener('session-deleted', handleSessionDeleted as EventListener);
    };
  }, [chatId, sessionInfo, activePolling]);

  // Clean up polling
  useEffect(() => {
    return () => {
      if (activePolling) {
        clearTimeout(activePolling);
        setActivePolling(null);
      }
    };
  }, []);

  // Clear temporary state when chatId changes (session binding)
  useEffect(() => {
    // Don't clear state during analysis if we're just transitioning from 'new' to actual chat ID
    // This prevents clearing state during the analysis flow
    if (analysisState.isAnalyzing) return;
    
    // Clear temporary input state when switching sessions
    setInputValue('');
    setIsLoading(false);
  }, [chatId, analysisState.isAnalyzing]); // Remove sessionInfo.sessions dependency, avoid other session state updates affecting current session

  // Special handling for switching to new chat
  const [previousChatId, setPreviousChatId] = useState<string | undefined>(chatId);
  useEffect(() => {
    // Check if switching from other session to new chat
    if (previousChatId && previousChatId !== 'new' && chatId === 'new') {
      console.log('🧹 Switching from session to new chat, clearing uploaded videos');
      // Clear temporary uploaded videos, prepare for new upload
      setUploadedVideos(currentVideos => {
        currentVideos.forEach((video) => URL.revokeObjectURL(video.url));
        return [];
      });
      setAnalysisState({
        isAnalyzing: false,
        progress: 0,
        currentStep: 'Initializing',
        selectedVideos: [],
      });
    }
    
    // Update previous chatId
    setPreviousChatId(chatId);
  }, [chatId, previousChatId]);

  // Adjust polling interval to 2 seconds to avoid too frequent steps
  const getPollingInterval = (): number => {
    return 2000; // 2 seconds query, balance real-time and stability
  };

  // Persistent polling function - support asynchronous flow
  const startPersistentPolling = (chatId: string) => {
    const poll = async () => {
      let shouldContinuePolling = true; // Default to continue polling
      
      try {
        console.log('DEBUG: Polling status for chat:', chatId);
        const result = await window.api.videorag.getStatus(chatId);
        
        if (result.success && result.data) {
          const status = result.data;
          console.log('🔍 Polling status:', status);
          
          // Handle different statuses
          switch (status.status) {
            case 'initializing':
              console.log('🔄 Initializing...');
              break;

            case 'completed':
              console.log('✅ Analysis completed!');
              await completeAnalysis(chatId, status.current_step, status.message);
              shouldContinuePolling = false; // Stop polling
              break;
              
            case 'error':
              console.error('❌ Analysis failed:', status.message);
              await addAnalysisStep(chatId, status.current_step, status.message, 'error');
              await handleAnalysisError(chatId, status.message || 'Analysis failed');
              shouldContinuePolling = false; // Stop polling
              break;
              

              
            case 'processing':
              // Processing video
              const currentStep = status.current_step || 'Processing';
              const message = status.message || 'Processing videos...';
              console.log(`🔄 Video processing: ${currentStep} - ${message}`);
              await addAnalysisStep(chatId, currentStep, message, 'active');
              break;
              
            case 'not_found':
              // Session not found - need to check if session is not created or deleted
              console.log('⚠️ Session not found in backend');
              
              // Check if session still exists in frontend session list
              const sessionExists = sessionInfo.getSessionInfo(chatId);
              if (!sessionExists) {
                // Frontend also does not have this session, indicating it has been deleted, stop polling
                console.log('🛑 Session also deleted from frontend, stopping polling');
                shouldContinuePolling = false;
              } else {
                // Frontend still has this session, possibly upload has not started, continue polling
                console.log('🔄 Session exists in frontend, continuing polling (upload may not have started)');
              }
              break;
              
            default:
              // Other status, continue polling
              console.log(`🔄 Unknown status: ${status.status} - ${status.message}`);
              if (status.current_step && status.message) {
                await addAnalysisStep(chatId, status.current_step, status.message, 'active');
              }
              break;
          }
          
        } else {
          console.warn('⚠️ Polling failed, will retry in next interval', result.error);
        }
        
      } catch (error: any) {
        console.error('❌ Polling error:', error);
        // Network error, continue retrying
      }
      
      // Ensure polling continues in all cases (unless explicitly stopped)
      if (shouldContinuePolling) {
        const interval = getPollingInterval();
        console.log(`🔄 Scheduling next poll in ${interval}ms`);
        const timeout = setTimeout(poll, interval);
        setActivePolling(timeout);
      } else {
        console.log('🛑 Polling stopped');
        setActivePolling(null);
      }
    };

    console.log('🚀 Starting persistent polling for chat:', chatId);
    // Start first polling
    poll();
  };

  // Stop polling function
  const stopPolling = () => {
    if (activePolling) {
      clearTimeout(activePolling);
      setActivePolling(null);
      console.log('🛑 Polling stopped');
    }
  };


  // Add or update analysis steps for video analysis (progress bar mode) - avoid duplicates but allow multiple videos independently
  const addAnalysisStep = async (chatId: string, stepName: string, message: string, status: 'active' | 'completed' | 'error') => {
    try {
      // Load existing messages from JSON file
      const result = await window.api.chatSessions.load(chatId);
      const existingMessages = result.session?.messages || [];
      
      // Find existing progress bar message
      const progressMsgIndex = existingMessages.findIndex((msg: any) => msg.isProgressBar);
      
      if (progressMsgIndex >= 0) {
        // Update existing progress bar message
        const progressMsg = existingMessages[progressMsgIndex];
        const currentSteps = progressMsg.analysisSteps || [];
        
        // Check if there is an exact duplicate step (step name + message content)
        const existingStepIndex = currentSteps.findIndex((step: any) => 
          step.name === stepName && step.message === message
        );
        
        let newSteps: AnalysisStep[];
        
        if (existingStepIndex >= 0) {
          // If an exact duplicate step is found, only update the status, do not add a new step
          newSteps = [...currentSteps];
          newSteps[existingStepIndex] = {
            ...newSteps[existingStepIndex],
            status,
            timestamp: new Date()
          };
          console.log(`🔄 Updated existing step: ${stepName} - ${message}`);
        } else {
          // If it is a new step (different stepName or message), add it
          // Change the previous active step to completed
          newSteps = currentSteps.map((step: any) => 
            step.status === 'active' 
              ? { ...step, status: 'completed' as const }
              : step
          );
          
          // Add new step
          newSteps.push({
            id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: stepName,
            message,
            status,
            timestamp: new Date()
          });
          console.log(`✅ Added new step: ${stepName} - ${message}`);
        }
        
        // Update messages in JSON file
        await updateMessage(chatId, progressMsg.id, { analysisSteps: newSteps });
      } else {
        // If no progress bar message is found, create a new one
        const newProgressMessage: Message = {
          id: `progress-${Date.now()}`,
          type: 'assistant',
          content: `Start Analyzing Videos`,
          timestamp: new Date(),
          isProgressBar: true,
          analysisSteps: [{
            id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: stepName,
            message,
            status,
            timestamp: new Date()
          }],
        };
        
        // Add new message to JSON file
        await addMessage(chatId, newProgressMessage);
        console.log(`🆕 Created new progress message with step: ${stepName} - ${message}`);
      }
    } catch (error) {
      console.error('Failed to add analysis step:', error);
    }
  };

  // Query progress management - flush mode update (with animation effect)
  const updateQueryProgress = async (chatId: string, stepName: string, message: string, status: 'active' | 'completed' | 'error') => {
    try {
      // Step 1: Load existing messages from JSON file
      const result = await window.api.chatSessions.load(chatId);
      const existingMessages = result.session?.messages || [];
      
      // Find existing query analysis message
      const queryMsgIndex = existingMessages.findIndex((msg: any) => msg.isQueryAnalyzing);
      
      if (queryMsgIndex >= 0) {
        // Update existing query analysis message
        await updateMessage(chatId, existingMessages[queryMsgIndex].id, { 
          queryStep: stepName,
          queryMessage: message,
          queryStatus: status
        });
      } else {
        // Create new query analysis message (with animation effect)
        const queryMessage: Message = {
          id: `query-analyzing-${Date.now()}`,
          type: 'assistant',
          content: '', // content is empty because using animation component to display
          timestamp: new Date(),
          isQueryAnalyzing: true,
          queryStep: stepName,
          queryMessage: message,
          queryStatus: status
        };
        
        await addMessage(chatId, queryMessage);
      }
    } catch (error) {
      console.error('Failed to update query progress:', error);
    }
  };

  // Complete analysis
  const completeAnalysis = async (chatId: string, stepName: string, message: string) => {
    // Stop polling
    stopPolling();
    
    // Add final completion step
    await addAnalysisStep(chatId, stepName, message, 'completed');
    
    // Complete analysis and update session info
    sessionInfo.completeAnalysis(chatId);
    
    // Update state
    setAnalysisState(prev => ({ 
      ...prev, 
      isAnalyzing: false,
    }));

    // Add completion message
    setTimeout(async () => {
      const completionMessage: Message = {
        id: `ai-${Date.now()}`,
        type: 'assistant',
        content: `🎉 Video analysis complete! You can now ask me questions!`,
        timestamp: new Date(),
      };

      // Add message according to JSON file priority
      await addMessage(chatId, completionMessage);
    }, 1000);
    
    // Clean up uploaded videos
    setUploadedVideos(currentVideos => {
      currentVideos.forEach((video) => URL.revokeObjectURL(video.url));
      return [];
    });
  };

  // Handle analysis error
  const handleAnalysisError = async (chatId: string, errorMessage: string) => {
    // Stop polling
    stopPolling();
    
    // Update state
    setAnalysisState(prev => ({
      ...prev,
      isAnalyzing: false,
    }));
    
    // Reset session state
    sessionInfo.updateSessionInfo(chatId, {
      analysisState: 'none',
      analysisProgress: 0,
    });

    // Display error message
    const errorMsg: Message = {
      id: `error-${Date.now()}`,
      type: 'assistant',
      content: `❌ Analysis Failed\n\nSorry, I encountered an error while analyzing your video:\n\n${errorMessage}\n\nPlease try again or check your VideoRAG configuration.`,
      timestamp: new Date(),
    };

    // Add error message according to JSON file priority
    await addMessage(chatId, errorMsg);
  };

  const handleStartAnalysis = useCallback(async () => {
    if (!chatId || uploadedVideos.length === 0) return;
    console.log('🚀 handleStartAnalysis');

    const videosCopy = [...uploadedVideos];

    // Create a new chat ID if needed and navigate
    let actualChatId = chatId;
    if (chatId === 'new') {
      actualChatId = generateChatId();
      // Navigate after setting analysis state to prevent clearing
      setTimeout(() => {
        navigate(`/chat/${actualChatId}`, { replace: true });
      }, 100);
    }

    // Create chat history event immediately with video name
    const title = videosCopy.length > 0
      ? `${videosCopy[0].name.replace(/\.[^/.]+$/, '')}`  // Remove file extension
      : 'Video Analysis';

    // Create or update session info
    const existingSessionInfo = sessionInfo.getSessionInfo(actualChatId);
    if (!existingSessionInfo) {
      const newSession = sessionInfo.createSessionInfo(actualChatId, title);
      if (!newSession) {
        console.error('❌ Failed to create session info for chatId:', actualChatId);
        return; // Prevent further execution
      }
    } else {
      sessionInfo.updateSessionInfo(actualChatId, { title });
    }

    // Start analysis by synchronizing memory state to JSON file
    console.log('💾 Syncing memory videos to JSON file:', videosCopy);
    sessionInfo.startAnalysis(actualChatId, videosCopy);

    // Set analysis state FIRST
    setAnalysisState({
      isAnalyzing: true,
      progress: 0,
      currentStep: 'Initializing',
      selectedVideos: videosCopy,
    });

    // Clear uploadedVideos in memory after starting analysis to avoid duplicate display
    console.log('🧹 Clearing memory uploadedVideos after starting analysis');
    setUploadedVideos([]);

    // Step 1: Start async VideoRAG workflow
    try {
      console.log('🚀 Starting async VideoRAG workflow...');
      
      // Get storage info for base path
      const storageInfo = await window.api.chatSessions.getStorageInfo();
      const baseStoragePath = storageInfo.storeDirectory || './videorag-sessions';
      
      // Start asynchronous VideoRAG analysis workflow - including session creation and video processing
      await startRealAnalysis(actualChatId, videosCopy, baseStoragePath);
      
    } catch (error: any) {
      console.error('❌ VideoRAG workflow startup failed:', error);
      await handleAnalysisError(actualChatId, error.message || 'Failed to start VideoRAG workflow');
    }

  }, [chatId, uploadedVideos, navigate, sessionInfo, activePolling]);

  // Start real VideoRAG analysis - asynchronous flow
  const startRealAnalysis = async (chatId: string, videos: UploadedVideo[], baseStoragePath: string) => {
    try {
      console.log('🔄 Starting async video analysis workflow...');
      console.log('🔄 videos:', videos.map(v => v.path));
      
      // Save video information to state for polling
      setAnalysisState(prev => ({
        ...prev,
        selectedVideos: videos
      }));
      
      // Start video analysis directly - includes VideoRAG instance creation and video processing
      console.log('🚀 Starting video analysis (includes VideoRAG creation and processing)...');
      
      try {
        // Pass video path list and storage path to backend
        const video_path_list = videos.map(v => v.path);
        console.log('🚀 Starting video upload/indexing with videos:', video_path_list);
        
        const uploadResult = await window.api.videorag.uploadVideo(chatId, video_path_list, baseStoragePath);
        
        if (!uploadResult.success) {
          throw new Error(`Failed to start video processing: ${uploadResult.error}`);
        }
        
        console.log('✅ Video processing started:', uploadResult.data?.status || 'unknown');
        
        // Immediately add initial processing step
        await addAnalysisStep(chatId, 'Initializing', 'Initializing AI Assistant...', 'active');
        
      } catch (error: any) {
        console.error('❌ Video processing startup failed:', error);
        throw new Error(`Failed to start video processing: ${error.message}`);
      }
      
      // Immediately start persistent polling - monitor video processing workflow
      console.log('🔄 Starting 5s persistent polling for video processing workflow...');
      startPersistentPolling(chatId);
      
    } catch (error: any) {
      console.error('❌ Video analysis workflow startup failed:', error);
      await handleAnalysisError(chatId, error.message || 'Failed to start video analysis workflow');
    }
  };

  // Start query processing
  const startQueryProcessing = async (chatId: string, query: string) => {
    try {
      console.log('🚀 Starting query processing for:', query);
      setIsQueryProcessing(true);
      
      // Call backend API to start query processing
      const queryResult = await window.api.videorag.queryVideo(chatId, query);
      
      if (!queryResult.success) {
        throw new Error(`Failed to start query processing: ${queryResult.error}`);
      }
      
      console.log('✅ Query processing started:', queryResult.data?.status || 'unknown');
      
      // Immediately add initial processing step
      await updateQueryProgress(chatId, 'Initializing', 'Initializing query processing...', 'active');
      
      // Start polling to monitor query processing progress
      console.log('🔄 Starting polling for query processing...');
      startQueryPolling(chatId);
      
    } catch (error: any) {
      console.error('❌ Query processing startup failed:', error);
      await handleQueryError(chatId, error.message || 'Failed to start query processing');
    }
  };

  // Query polling function
  const startQueryPolling = (chatId: string) => {
    const poll = async () => {
      let shouldContinuePolling = true;
      
      try {
        console.log('DEBUG: Polling query status for chat:', chatId);
        const result = await window.api.videorag.getStatus(chatId, 'query');
        
        if (result.success && result.data) {
          const status = result.data;
          console.log('🔍 Query status:', status);
          
          switch (status.status) {
            case 'completed':
              console.log('✅ Query processing completed!');
              await completeQueryProcessing(chatId, status.current_step, status.message, status.answer);
              shouldContinuePolling = false;
              break;
              
            case 'error':
              console.error('❌ Query processing failed:', status.message);
              await updateQueryProgress(chatId, status.current_step, status.message, 'error');
              await handleQueryError(chatId, status.message || 'Query processing failed');
              shouldContinuePolling = false;
              break;
              
            case 'processing':
              const currentStep = status.current_step || 'Processing';
              const message = status.message || 'Processing query...';
              console.log(`🔄 Query processing: ${currentStep} - ${message}`);
              await updateQueryProgress(chatId, currentStep, message, 'active');
              break;
          }
        }
      } catch (error: any) {
        console.error('❌ Query polling error:', error);
      }
      
      if (shouldContinuePolling) {
        const interval = getPollingInterval();
        console.log(`🔄 Scheduling next query poll in ${interval}ms`);
        const timeout = setTimeout(poll, interval);
        setActivePolling(timeout);
      } else {
        console.log('🛑 Query polling stopped');
        setActivePolling(null);
      }
    };

    console.log('🚀 Starting query polling for chat:', chatId);
    poll();
  };

  // Complete query processing
  const completeQueryProcessing = async (chatId: string, stepName: string, message: string, answer: string) => {
    // Stop polling
    stopPolling();
    console.log('🔄 completeQueryProcessing', chatId, stepName, message, answer);
    // Delete analyzing message, add final answer
    try {
      // Step 1: Load existing messages from JSON file
      const result = await window.api.chatSessions.load(chatId);
      const existingMessages = result.session?.messages || [];
      
      // Find and delete query analysis message
      const queryMsgIndex = existingMessages.findIndex((msg: any) => msg.isQueryAnalyzing);
      if (queryMsgIndex >= 0) {
        const updatedMessages = existingMessages.filter((msg: any) => !msg.isQueryAnalyzing);
        
        // Save message list after deleting analysis message
        await window.api.chatSessions.save(chatId, {
          ...result.session,
          messages: updatedMessages,
          lastUpdated: new Date().toISOString()
        });
      }
      
      // Add final answer message
      const aiResponse: Message = {
        id: `ai-${Date.now()}`,
        type: 'assistant',
        content: answer || 'Query processing completed',
        timestamp: new Date(),
      };

      await addMessage(chatId, aiResponse);
      
    } catch (error) {
      console.error('Failed to complete query processing:', error);
    }
    
    // Update state
    setIsLoading(false);
    setIsQueryProcessing(false);
  };

  // Handle query error
  const handleQueryError = async (chatId: string, errorMessage: string) => {
    // Stop polling
    stopPolling();
    
    // Delete analyzing message, add error message
    try {
      // Step 1: Load existing messages from JSON file
      const result = await window.api.chatSessions.load(chatId);
      const existingMessages = result.session?.messages || [];
      
      // Find and delete query analysis message
      const queryMsgIndex = existingMessages.findIndex((msg: any) => msg.isQueryAnalyzing);
      if (queryMsgIndex >= 0) {
        const updatedMessages = existingMessages.filter((msg: any) => !msg.isQueryAnalyzing);
        
        // Save message list after deleting analysis message
        await window.api.chatSessions.save(chatId, {
          ...result.session,
          messages: updatedMessages,
          lastUpdated: new Date().toISOString()
        });
      }
      
      // Display error message
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        type: 'assistant',
        content: `❌ Query Processing Failed\n\nSorry, I encountered an error while processing your query:\n\n${errorMessage}\n\nPlease try again.`,
        timestamp: new Date(),
      };

      await addMessage(chatId, errorMsg);
      
    } catch (error) {
      console.error('Failed to handle query error:', error);
    }
    
    // Update state
    setIsLoading(false);
    setIsQueryProcessing(false);
  };

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() && uploadedVideos.length === 0) return;
    if (!chatId) return;
    
    // If analysis or query processing is in progress, do not process message sending
    if (analysisState.isAnalyzing || isQueryProcessing) {
      console.log('📝 Skipping message send during analysis or query processing');
      return;
    }

    const newMessage: Message = {
      id: generateMessageId(),
      type: 'user',
      content: inputValue || 'Uploaded videos for analysis',
      timestamp: new Date(),
      videos: uploadedVideos.map((v) => v.name),
    };

    let actualChatId = chatId;

    // If it's a new chat, create a unique chat ID
    if (chatId === 'new') {
      actualChatId = generateChatId();
      navigate(`/chat/${actualChatId}`, { replace: true });
    }

    // Create session info if it doesn't exist
    const existingSessionInfo = sessionInfo.getSessionInfo(actualChatId);
    if (!existingSessionInfo) {
      const title = inputValue.trim()
        ? inputValue.length > 50
          ? inputValue.substring(0, 50) + '...'
          : inputValue
        : uploadedVideos.length > 0
          ? `Video Analysis: ${uploadedVideos[0].name}`
          : 'New Chat';
      const newSession = sessionInfo.createSessionInfo(actualChatId, title);
      if (!newSession) {
        console.error('❌ Failed to create session info for chatId:', actualChatId);
        return; // Prevent further execution
      }
    }

    // Save message to session info using JSON-first approach
    await addMessage(actualChatId, newMessage);

    setInputValue('');
    setIsLoading(true);

    try {
      let aiContent: string;
      
      // Prioritize indexed videos from JSON file instead of relying on backend API
      const currentSessionInfo = sessionInfo.getSessionInfo(actualChatId);
      const sessionVideos = currentSessionInfo?.videos || [];
      const isSessionCompleted = currentSessionInfo?.analysisState === 'completed';
      const isSessionAnalyzing = currentSessionInfo?.analysisState === 'analyzing';
      
      console.log('🔍 Debug - sessionVideos:', sessionVideos.length, 'isSessionCompleted:', isSessionCompleted, 'isSessionAnalyzing:', isSessionAnalyzing, 'indexedVideos:', indexedVideos.length, 'sessionStatus:', sessionStatus);
      
      // Use session state from JSON file to determine if there are available videos
      if (!isSessionCompleted && sessionVideos.length === 0) {
        // Session not created yet
        aiContent = `🎯 New Chat Session\n\n` +
                   `Welcome to this new chat session! Each session maintains its own video index for organized analysis.\n\n` +
                   `To get started:\n` +
                   `1. Upload videos using the "Choose Videos" button\n` +
                   `2. Wait for the indexing process to complete\n` +
                   `3. Ask questions about your video content (coming soon)\n\n` +
                   `Your videos will be stored in: chat-${chatId}/`;
      } else if (isSessionAnalyzing) {
        // Videos are being processed - use JSON session data
        aiContent = `⏳ Video Processing in Progress\n\n` +
                   `Currently processing ${sessionVideos.length} video(s) in this session:\n\n` +
                   `${sessionVideos.map((v, i) => `${i + 1}. ${v.name}`).join('\n')}\n\n` +
                   `Please wait for the indexing to complete before asking questions about the video content. ` +
                   `This process includes video segmentation, speech recognition, visual analysis, and knowledge graph construction.\n\n` +
                   `Session: chat-${actualChatId}/`;
      } else if (!isSessionCompleted) {
        // No videos indexed in this session yet
        aiContent = `📺 No Videos in This Session\n\n` +
                   `This chat session doesn't have any indexed videos yet. To get started:\n\n` +
                   `1. Upload videos using the "Choose Videos" button\n` +
                   `2. Wait for the indexing process to complete\n` +
                   `3. Once ready, I can answer questions about your video content\n\n` +
                   `Each session maintains its own video index for organized analysis.\n` +
                   `Session directory: chat-${actualChatId}/`;
      } else {
        // Videos are available - start query processing (session completed)
        if (inputValue.trim()) {
          // User has a query and session is completed - start query processing
          await startQueryProcessing(actualChatId, inputValue.trim());
          return; // Exit early, query processing will handle the response
        } else {
          // No query provided - show status
          aiContent = `🎉 Videos Ready for Analysis!\n\n` +
                     `Great! This session has successfully indexed ${sessionVideos.length} video(s):\n\n` +
                     `${sessionVideos.map((v, i) => `${i + 1}. ${v.name.replace(/\.[^/.]+$/, '')}`).join('\n')}\n\n` +
                     `You can now ask me questions about your video content. What would you like to know?\n\n` +
                     `Your videos have been processed with speech recognition, visual analysis, and knowledge graph construction.\n` +
                     `Session directory: chat-${actualChatId}/`;
        }
      }

      const aiResponse: Message = {
        id: `ai-${Date.now()}`,
        type: 'assistant',
        content: aiContent,
        timestamp: new Date(),
      };

      // Add AI response according to JSON file priority
      if (actualChatId && actualChatId !== 'new') {
        await addMessage(actualChatId, aiResponse);
      }
      
    } catch (error) {
      // Handle call exceptions
      console.error('Error in VideoRAG status check:', error);
      
      const errorResponse: Message = {
        id: `ai-${Date.now()}`,
        type: 'assistant',
        content: `🚨 System Error\n\n` +
                 `Error details: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                 `💡 Please try:\n` +
                 `• Refreshing the page\n` +
                 `• Checking VideoRAG configuration\n` +
                 `• Restarting the application`,
        timestamp: new Date(),
      };

      // Add error response according to JSON file priority
      if (actualChatId && actualChatId !== 'new') {
        await addMessage(actualChatId, errorResponse);
      }
    } finally {
      setIsLoading(false);
    }

    // Clear uploaded videos
    uploadedVideos.forEach((video) => URL.revokeObjectURL(video.url));
    setUploadedVideos([]);
  }, [inputValue, uploadedVideos, messages, chatId, navigate, sessionStatus, indexedVideos, processingVideos, videoStatus, videoragError]);

  return {
    messages,
    inputValue,
    setInputValue,
    uploadedVideos,
    setUploadedVideos,
    isLoading,
    isQueryProcessing,
    handleSendMessage,
    handleStartAnalysis,
    analysisState,
    sessionInfo,
  };
}; 