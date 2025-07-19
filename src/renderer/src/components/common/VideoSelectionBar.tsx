import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Sparkles, CheckCircle } from 'lucide-react';
import { UploadedVideo } from '../../types/chat';
import { VideoPreviewCard } from './VideoPreviewCard';
import { Button } from '../ui/button';

interface VideoSelectionBarProps {
  videos: UploadedVideo[];
  onRemoveVideo: (videoId: string) => void;
  onStartAnalysis: () => void;
  formatFileSize: (bytes: number) => string;
  isServiceReady: boolean;
  isAnalyzing?: boolean;
  analysisCompleted?: boolean;
}

export const VideoSelectionBar: React.FC<VideoSelectionBarProps> = ({
  videos,
  onRemoveVideo,
  onStartAnalysis,
  formatFileSize,
  isServiceReady,
  isAnalyzing = false,
  analysisCompleted = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Auto-collapse when analysis starts, but allow manual expansion during analysis
  useEffect(() => {
    if (isAnalyzing && isExpanded) {
      setIsExpanded(false);
    }
  }, [isAnalyzing]);

  if (videos.length === 0) return null;

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const getStatusText = () => {
    if (analysisCompleted) {
      return `${videos.length} Video${videos.length > 1 ? 's' : ''} Analyzed`;
    }
    if (isAnalyzing) {
      return `${videos.length} Video${videos.length > 1 ? 's' : ''} Being Analyzed`;
    }
    return `${videos.length} Video${videos.length > 1 ? 's' : ''} Selected`;
  };

  const getStatusIndicator = () => {
    if (analysisCompleted) {
      return (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle size={16} />
          <span className="text-sm">Completed</span>
        </div>
      );
    }
    if (isAnalyzing) {
      return (
        <div className="flex items-center gap-2 text-blue-600">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-sm">Processing...</span>
        </div>
      );
    }
    return null;
  };

  const isDeleteDisabled = isAnalyzing || analysisCompleted;
  const isAnalysisButtonDisabled = !isServiceReady || videos.length === 0 || isAnalyzing || analysisCompleted;
  
  // Only show Start Analysis button when new chat and not analyzing
  const shouldShowAnalysisButton = !isAnalyzing && !analysisCompleted;

  return (
    <div className="bg-white border border-gray-200 shadow-lg transition-all duration-300 rounded-b-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-100 rounded-t-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleExpanded}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
          >
            {isExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            <span className="font-medium">
              {getStatusText()}
            </span>
          </button>
          {getStatusIndicator()}
        </div>
        
        {/* Only show Start Analysis button when needed */}
        {shouldShowAnalysisButton && (
          <div className="flex items-center gap-3">
            <Button
              onClick={onStartAnalysis}
              disabled={isAnalysisButtonDisabled}
              className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                isAnalysisButtonDisabled
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white'
              }`}
            >
              <Sparkles size={16} />
              Start Analysis
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`overflow-hidden transition-all duration-300 ${
        isExpanded ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="p-4">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {videos.map((video) => (
              <div key={video.id} className="flex-shrink-0 w-80">
                <VideoPreviewCard
                  video={video}
                  onRemove={onRemoveVideo}
                  formatFileSize={formatFileSize}
                  disabled={isDeleteDisabled}
                  showDeleteButton={!isDeleteDisabled}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}; 