import React from 'react';
import { Send, GripHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { useServiceContext } from '../../contexts/ServiceContext';

interface ChatInputProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  onVideoUpload: () => void;
  onSendMessage: () => void;
  isLoading: boolean;
  height: number;
  onResizeMouseDown: (e: React.MouseEvent) => void;
  isAnalyzing?: boolean;
  isQueryProcessing?: boolean;
}

export const ChatInput = ({
  inputValue,
  setInputValue,
  onSendMessage,
  isLoading,
  height,
  onResizeMouseDown,
  isAnalyzing = false,
  isQueryProcessing = false,
}: ChatInputProps) => {
  const { serviceState, loading } = useServiceContext();
  
  // Only allow sending messages when ImageBind is loaded and not in operation
  const isServiceReady = serviceState.imagebindLoaded && !loading.loadingImageBind && !loading.releasingImageBind;
  const isInputDisabled = isAnalyzing || isQueryProcessing || isLoading || !isServiceReady;
  


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isInputDisabled) {
      e.preventDefault();
      onSendMessage();
    }
  };

  const handleSendMessage = () => {
    if (!isInputDisabled) {
      onSendMessage();
    }
  };

  return (
    <div 
      className="bg-white border-t flex-shrink-0 relative"
      style={{ height: `${height}px` }}
    >
      {/* Resize Handle */}
      <div
        className="absolute top-0 left-0 right-0 h-2 cursor-row-resize bg-transparent hover:bg-gray-200 transition-all duration-200 group"
        onMouseDown={onResizeMouseDown}
        style={{ zIndex: 50 }}
        title="Drag to resize chat area"
      >
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-0.5 bg-gray-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <GripHorizontal size={12} className="text-gray-400" />
        </div>
      </div>
      
      <div className="max-w-3xl mx-auto p-4 h-full flex flex-col">
        {/* Input Box - Claude Style */}
        <div className="relative bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-3">
            <div className="relative">
              {/* Input Box */}
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  isAnalyzing 
                    ? "Please wait, analyzing your video..." 
                    : isQueryProcessing
                      ? "Processing your query..."
                      : !isServiceReady 
                        ? "Vimo service is not ready..." 
                        : "Ask me anything about your videos..."
                }
                disabled={isInputDisabled}
                className={`w-full px-4 py-3 pr-12 border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm leading-relaxed min-h-[44px] ${
                  isInputDisabled
                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    : 'bg-white text-gray-900'
                }`}
                style={{
                  height: '44px',
                  minHeight: '44px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                }}
                rows={1}
              />
              
              {/* Send Button - Absolute Positioned in Top Right */}
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isInputDisabled}
                className={`absolute right-1 top-2 h-8 w-8 p-0 ${
                  isInputDisabled
                    ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'
                }`}
              >
                <Send size={14} className="text-white" />
              </Button>
            </div>
            
            {/* Toolbar */}
            <div className="flex items-center justify-end mt-3">
              <div className="text-xs text-gray-500">
                {isAnalyzing 
                  ? 'Please wait for analysis to complete'
                  : isQueryProcessing
                    ? 'Please wait for query processing to complete'
                    : !isServiceReady 
                      ? 'Vimo service not ready'
                      : 'Enter to send, Shift+Enter for new line'
                }
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}; 