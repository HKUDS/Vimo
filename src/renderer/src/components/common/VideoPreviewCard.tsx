import React, { useState, useEffect } from 'react';
import { Clock, X, Video } from 'lucide-react';
import { UploadedVideo } from '../../types/chat';

interface VideoPreviewCardProps {
  video: UploadedVideo;
  onRemove: (videoId: string) => void;
  formatFileSize: (bytes: number) => string;
  disabled?: boolean;
  showDeleteButton?: boolean;
}

export const VideoPreviewCard: React.FC<VideoPreviewCardProps> = ({
  video,
  onRemove,
  disabled = false,
  showDeleteButton = true,
}) => {
  const [duration, setDuration] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Reset states when video URL changes
    setDuration(null);
    setIsLoading(true);

    const fetchVideoDuration = async () => {
      try {
        if (!video.path) {
          console.error('❌ VideoPreviewCard: video.path is undefined or empty');
          return;
        }
        
        // Use window.api to call video duration API
        const result = await window.api.videorag.getVideoDuration(video.path);
        
        if (result.success) {
          setDuration(result.duration ?? null);
        } else {
          console.error('Failed to get video duration:', result.error);
        }
      } catch (error) {
        console.error('Error fetching video duration:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideoDuration();
  }, [video.path]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRemove = () => {
    if (!disabled && showDeleteButton) {
      onRemove(video.id);
    }
  };

  return (
    <div className={`relative bg-white rounded-lg shadow-sm border transition-all duration-200 group p-4 ${
      disabled 
        ? 'border-gray-200 opacity-75' 
        : 'border-gray-200 hover:shadow-md'
    }`}>
      {/* Remove button - only show if showDeleteButton is true */}
      {showDeleteButton && (
        <button
          onClick={handleRemove}
          disabled={disabled}
          className={`absolute top-2 right-2 z-10 rounded-full p-1 transition-opacity ${
            disabled 
              ? 'bg-gray-400 text-gray-300 cursor-not-allowed opacity-50' 
              : 'bg-black bg-opacity-50 hover:bg-opacity-70 text-white opacity-0 group-hover:opacity-100'
          }`}
        >
          <X size={14} />
        </button>
      )}

      {/* Video icon and info */}
      <div className="flex items-start gap-3">
        {/* Video icon */}
        <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
          disabled 
            ? 'bg-gray-400' 
            : 'bg-gradient-to-r from-blue-500 to-purple-600'
        }`}>
          <Video size={20} className="text-white" />
        </div>

        {/* Video details */}
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-medium mb-2 leading-tight ${
            disabled ? 'text-gray-500' : 'text-gray-800'
          }`}
              style={{ 
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                minHeight: '2.5rem'
              }}
              title={video.name}>
            {video.name}
          </h3>
          
          {/* Duration info */}
          <div className={`flex items-center gap-1 text-xs ${
            disabled ? 'text-gray-400' : 'text-gray-500'
          }`}>
            <Clock size={12} />
            {isLoading ? (
              <span>Loading...</span>
            ) : duration ? (
              <span>{formatDuration(duration)}</span>
            ) : (
              <span>--:--</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 