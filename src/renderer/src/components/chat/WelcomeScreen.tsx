import { Video, Upload } from 'lucide-react';
import { Button } from '../ui/button';
import { useServiceContext } from '../../contexts/ServiceContext';
import { UploadedVideo, VideoAnalysisState } from '../../types/chat';

interface WelcomeScreenProps {
  onVideoUpload: () => void;
  uploadedVideos: UploadedVideo[];
  onRemoveVideo: (videoId: string) => void;
  onStartAnalysis: () => void;
  formatFileSize: (bytes: number) => string;
  analysisState: VideoAnalysisState;
}

export const WelcomeScreen = ({ 
  onVideoUpload, 
  uploadedVideos,
  analysisState 
}: WelcomeScreenProps) => {
  const { serviceState, loading } = useServiceContext();
  
  // Only allow uploading videos when ImageBind is loaded and not in operation
  const isServiceReady = serviceState.imagebindLoaded && !loading.loadingImageBind && !loading.releasingImageBind;
  

  
  // Debug information
  console.log('WelcomeScreen - Analysis State:', { 
    isAnalyzing: analysisState.isAnalyzing,
    progress: analysisState.progress,
    currentStep: analysisState.currentStep,
    selectedVideos: analysisState.selectedVideos,
    uploadedVideos: uploadedVideos,
    shouldShowVideoBar: uploadedVideos.length > 0 || analysisState.selectedVideos.length > 0
  });

  const handleClick = () => {
    if (isServiceReady) {
      onVideoUpload();
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Main Content */}
      <div className={`flex-1 flex flex-col justify-start p-8 ${
        (uploadedVideos.length > 0 || analysisState.selectedVideos.length > 0) ? 'pt-20' : 'pt-16'
      }`}>
        {!analysisState.isAnalyzing && (
          /* Welcome View */
          <div className="text-center max-w-4xl mx-auto">
            {/* Welcome Message */}
            <div className="mb-16">
              <h1 className="text-5xl font-bold text-gray-800 mb-4">
                Welcome, it's <span className="bg-gradient-to-r from-blue-500 via-purple-600 to-pink-500 bg-clip-text text-transparent">Vimo</span> !
              </h1>
            </div>

            {/* Video Upload Card - Main Feature */}
            <div
              className={`bg-white rounded-3xl border-2 border-dashed p-16 transition-all duration-300 group ${
                isServiceReady 
                  ? 'border-gray-200 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30' 
                  : 'border-gray-100 cursor-not-allowed opacity-60'
              }`}
              onClick={isServiceReady ? handleClick : undefined}
            >
              <div className="flex flex-col items-center">
                <div className={`w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-6 transition-transform ${
                  isServiceReady ? 'group-hover:scale-110' : ''
                }`}>
                  <Video size={40} className="text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-800 mb-3">
                  Upload Your Videos
                </h3>
                <p className="text-gray-600 mb-8 max-w-lg text-lg">
                  Upload videos to get started with intelligent video analysis.
                </p>
                <Button 
                  className={`px-8 py-3 rounded-lg font-medium text-lg ${
                    isServiceReady 
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white' 
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  disabled={!isServiceReady}
                >
                  <Upload size={20} className="mr-2" />
                  Choose Videos
                </Button>
                <p className="text-sm text-gray-500 mt-6">
                  Supported formats: MP4, MOV, AVI, WebM
                </p>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}; 