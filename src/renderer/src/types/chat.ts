export interface AnalysisStep {
  id: string;
  name: string;
  message: string;
  status: 'active' | 'completed' | 'error';
  timestamp: Date;
}

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  videos?: string[];
  isProgressBar?: boolean;
  analysisSteps?: AnalysisStep[];
  messageCategory?: 'user_query' | 'assistant_response' | 'analysis_status' | 'system_info';
  // Query analyzing related fields
  isQueryAnalyzing?: boolean;
  queryStep?: string;
  queryMessage?: string;
  queryStatus?: 'active' | 'completed' | 'error';
}

export interface UploadedVideo {
  id: string;
  name: string;
  url: string;
  path: string; // Real file path
  size: number;
  duration?: number;
  thumbnail?: string;
}

export interface VideoAnalysisState {
  isAnalyzing: boolean;
  progress: number;
  currentStep: string;
  selectedVideos: UploadedVideo[];
}

// Chat Session information persistent storage
export interface ChatSessionInfo {
  id: string;
  title: string;
  createdAt: Date;
  lastUpdated: Date;
  videos: UploadedVideo[];
  analysisState: 'none' | 'analyzing' | 'completed';
  analysisProgress?: number;
  currentStep?: string;
  lastMessage?: string;
  // Note: messages removed from memory, will be loaded from file system on demand
}

// Note: ChatSessionsStorage interface removed as each session is now stored individually

export interface ChatState {
  messages: Message[];
  uploadedVideos: UploadedVideo[];
  inputValue: string;
  isLoading: boolean;
  inputAreaHeight: number;
  isDragging: boolean;
  realTimeHeight: number;
  analysisState: VideoAnalysisState;
} 