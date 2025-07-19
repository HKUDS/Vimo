import { useRef, useEffect } from 'react';
import { Video } from 'lucide-react';
import { Message } from '../../types/chat';
import { ChatProgressBar } from './ChatProgressBar';
import vimoLogo from '../../assets/images/vimi-logo.png';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export const MessageList = ({ messages, isLoading }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="h-full overflow-y-auto px-4 pt-20 pb-6">
      <div className="max-w-3xl mx-auto transition-all duration-300">
        {messages.map((message) => (
          <div key={message.id} className="mb-6">
            {message.type === 'user' ? (
              // User Message
              <div className="flex justify-end">
                <div className="max-w-[85%]">
                  {message.videos && message.videos.length > 0 && (
                    <div className="mb-2 text-right">
                      <div className="inline-flex items-center gap-1 text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                        <Video size={14} />
                        {message.videos.length} video(s) uploaded
                      </div>
                    </div>
                  )}
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-2xl rounded-tr-md shadow-lg">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              // Assistant Message
              <div className="flex justify-start">
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-2 mb-2">
                    <img src={vimoLogo} alt="Vimo" className="w-6 h-6 rounded-lg shadow-sm border border-gray-100/50" />
                    <span className="text-sm font-medium text-gray-600">
                      Vimo
                    </span>
                  </div>
                  <div className={`bg-white p-4 rounded-2xl rounded-tl-md shadow-sm border border-gray-100 transition-all duration-500 ease-out ${
                    message.isProgressBar ? 'overflow-hidden' : ''
                  }`}>
                    {message.isProgressBar ? (
                      <div className="transition-all duration-500 ease-out">
                        <ChatProgressBar
                          content={message.content}
                          analysisSteps={message.analysisSteps || []}
                        />
                      </div>
                    ) : message.isQueryAnalyzing ? (
                      <div className="flex items-center gap-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: '0.1s' }}
                          ></div>
                          <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: '0.2s' }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600">
                          Analyzing... {message.queryMessage}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                        {message.content}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              <div className="flex items-center gap-2 mb-2">
                <img src={vimoLogo} alt="Vimo" className="w-6 h-6 rounded-lg shadow-sm border border-gray-100/50" />
                <span className="text-sm font-medium text-gray-600">
                  Vimo
                </span>
              </div>
              <div className="bg-white p-4 rounded-2xl rounded-tl-md shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                  </div>
                  <span className="text-sm text-gray-600">Analyzing...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}; 