import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Key,
  FolderOpen,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Download,
  Settings as SettingsIcon,
  Cpu,
} from 'lucide-react';

interface SettingsState {
  // OpenAI Configuration
  openaiBaseUrl: string;
  openaiApiKey: string;
  processingModel: string; // processing model - for massive preprocessing
  analysisModel: string;   // analysis model - for fine-grained analysis
  
  // DashScope Configuration
  dashscopeApiKey: string;
  captionModel: string;    // video description model
  asrModel: string;        // speech recognition model
  
  // System Configuration
  storeDirectory: string; // model storage directory
  
  // Initialization tracking
  imagebindInstalled: boolean;
}

const Settings = () => {
  const [settings, setSettings] = useState<SettingsState>({
    openaiBaseUrl: '',
    openaiApiKey: '',
    processingModel: 'gpt-4o-mini',
    analysisModel: 'gpt-4o-mini', 
    dashscopeApiKey: '',
    captionModel: 'qwen-vl-plus-latest',
    asrModel: 'paraformer-realtime-v2',
    storeDirectory: '',
    imagebindInstalled: false,
  });

  const [apiConfigStatus, setApiConfigStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');



// Model Status Section Component
const ModelStatusSection = ({ storeDirectory }: { storeDirectory: string }) => {
  const [modelStatus, setModelStatus] = useState<{
    imagebind: boolean;
    checking: boolean;
  }>({
    imagebind: false,
    checking: false,
  });

  const checkModelStatus = async () => {
    if (!storeDirectory) {
      setModelStatus(prev => ({ ...prev, imagebind: false }));
      return;
    }

    setModelStatus(prev => ({ ...prev, checking: true }));
    
    try {
      const result = await window.api.checkModelFiles(storeDirectory);
      setModelStatus({
        imagebind: result.imagebind,
        checking: false,
      });
    } catch (error) {
      console.error('Failed to check model status:', error);
      setModelStatus({ imagebind: false, checking: false });
    }
  };

  useEffect(() => {
    checkModelStatus();
  }, [storeDirectory]);

  const getStatusMessage = () => {
    if (!storeDirectory) return 'Please select a storage directory first';
    if (modelStatus.checking) return 'Checking model status...';
    if (modelStatus.imagebind) return 'Ready to use';
    return 'Model not found - run initialization wizard';
  };

  const getStatusColor = () => {
    if (!storeDirectory || !modelStatus.imagebind) return 'text-gray-500';
    if (modelStatus.imagebind) return 'text-green-600';
    return 'text-red-600';
  };

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Cpu className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium">ImageBind Model</h4>
              {modelStatus.checking ? (
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              ) : modelStatus.imagebind ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600" />
              )}
            </div>
            <p className="text-xs text-gray-500">~4.5GB • Image Understanding</p>
            <p className={`text-sm ${getStatusColor()}`}>
              {getStatusMessage()}
            </p>
          </div>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={checkModelStatus}
          disabled={modelStatus.checking || !storeDirectory}
        >
          {modelStatus.checking ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Check Status
        </Button>
      </div>
    </div>
  );
};



  // Load settings
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load settings from configuration file
      const result = await window.api.loadSettings();
      if (result.success && result.settings) {
        // Merge saved settings and default settings
        setSettings(prevSettings => ({
          ...prevSettings,
          ...result.settings,
        }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleOpenaiChange = (field: string, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleDashscopeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings((prev) => ({ ...prev, dashscopeApiKey: e.target.value }));
  };

  const handleApiConfigSave = async () => {
    setApiConfigStatus('saving');
    try {
      // Step 1: Save settings to file
      const saveResult = await window.api.saveSettings(settings);
      
      if (!saveResult.success) {
        setApiConfigStatus('error');
        setTimeout(() => setApiConfigStatus('idle'), 2000);
        return;
      }
      
      // Step 2: Trigger VideoRAG configuration initialization
      try {
        const initResult = await window.api.videorag.reinitializeConfig();
        
        if (initResult.success) {
          setApiConfigStatus('saved');
          console.log('✅ VideoRAG configuration initialized successfully');
        } else {
          console.warn('⚠️ Settings saved but VideoRAG initialization failed:', initResult.error);
          setApiConfigStatus('saved'); // Still show success since settings were saved
        }
      } catch (initError) {
        console.warn('⚠️ Settings saved but VideoRAG initialization failed:', initError);
        setApiConfigStatus('saved'); // Still show success since settings were saved
      }
      
      // Trigger configuration update event, notify sidebar to reload sessions (if storage directory has changed)
      if (settings.storeDirectory) {
        const event = new CustomEvent('storage-config-updated', {
          detail: { storeDirectory: settings.storeDirectory }
        });
        window.dispatchEvent(event);
      }
      
      setTimeout(() => setApiConfigStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save API configuration:', error);
      setApiConfigStatus('error');
      setTimeout(() => setApiConfigStatus('idle'), 2000);
    }
  };

  const getApiConfigButtonText = () => {
    switch (apiConfigStatus) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved!';
      case 'error':
        return 'Save API Configuration';
      default:
        return 'Save API Configuration';
    }
  };

  const getApiConfigButtonIcon = () => {
    switch (apiConfigStatus) {
      case 'saving':
        return <RefreshCw className="animate-spin" size={16} />;
      case 'saved':
        return <CheckCircle className="text-green-600" size={16} />;
      case 'error':
        return <XCircle className="text-red-600" size={16} />;
      default:
        return <Key size={16} />;
    }
  };

  // Restart initialization wizard
  const restartInitializationWizard = async () => {
    const confirmed = window.confirm(
      'This will restart the application and reset all initialization settings. Are you sure you want to continue?'
    );
    
    if (!confirmed) return;

    try {
      // 1. Clear configuration files
      console.log('Clearing configuration files...');
      await window.api.app.clearConfig();
      
      // 2. Restart application
      console.log('Restarting application...');
      await window.api.app.restart();
      
    } catch (error) {
      console.error('Failed to restart initialization wizard:', error);
      alert('Failed to restart setup wizard. Please try again.');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header Area */}
      <div
        className="draggable-area h-8 w-full"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">
              Configure your Vimo application preferences and environment.
            </p>
          </div>

          {/* API Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Key size={20} />
                </div>
                <div>
                  <CardTitle>API Configuration</CardTitle>
                  <CardDescription>
                    Configure your API keys for external services
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* OpenAI Configuration */}
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-800">OpenAI Configuration</h3>
                <p className="text-sm text-gray-600">Configure OpenAI API for language model services</p>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Base URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://api.openai.com/v1"
                      value={settings.openaiBaseUrl}
                      onChange={(e) => handleOpenaiChange('openaiBaseUrl', e.target.value)}
                      className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      API Key
                    </label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={settings.openaiApiKey}
                      onChange={(e) => handleOpenaiChange('openaiApiKey', e.target.value)}
                      className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-2">
                        Processing Model
                      </label>
                      <input
                        type="text"
                        value="gpt-4o-mini"
                        readOnly
                        className="w-full px-3 py-2 text-sm border rounded-md bg-gray-100 text-gray-600"
                      />
                      <p className="text-xs text-gray-500 mt-1">Fixed model for high-volume preprocessing tasks</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium block mb-2">
                        Analysis Model
                      </label>
                      <input
                        type="text"
                        value="gpt-4o-mini"
                        readOnly
                        className="w-full px-3 py-2 text-sm border rounded-md bg-gray-100 text-gray-600"
                      />
                      <p className="text-xs text-gray-500 mt-1">Fixed model for detailed analysis tasks</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* DashScope Configuration */}
              <div className="space-y-4 p-4 border rounded-lg bg-orange-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">DashScope Configuration</h3>
                    <p className="text-sm text-gray-600">Configure Alibaba Cloud DashScope API for video captioning</p>
                  </div>
                  <a
                    href="https://www.alibabacloud.com/help/en/model-studio/get-api-key?spm=a2c63.p38356.0.i1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink size={14} />
                    Get API Key Tutorial
                  </a>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      DashScope API Key
                    </label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={settings.dashscopeApiKey}
                      onChange={handleDashscopeChange}
                      className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-2">
                        Caption Model
                      </label>
                      <input
                        type="text"
                        value="qwen-vl-plus-latest"
                        readOnly
                        className="w-full px-3 py-2 text-sm border rounded-md bg-gray-100 text-gray-600"
                      />
                      <p className="text-xs text-gray-500 mt-1">Fixed model for video captioning tasks</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium block mb-2">
                        ASR Model
                      </label>
                      <input
                        type="text"
                        value="paraformer-realtime-v2"
                        readOnly
                        className="w-full px-3 py-2 text-sm border rounded-md bg-gray-100 text-gray-600"
                      />
                      <p className="text-xs text-gray-500 mt-1">Fixed model for speech recognition tasks</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                All API keys are stored locally and never shared with third parties
              </p>
              
              {/* Save API Configuration Button */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={handleApiConfigSave}
                  disabled={apiConfigStatus === 'saving'}
                  className="px-6"
                >
                  {getApiConfigButtonIcon()}
                  <span className="ml-2">{getApiConfigButtonText()}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Model Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Download size={20} />
                </div>
                <div>
                  <CardTitle>AI Model Status</CardTitle>
                  <CardDescription>
                    Check the status of ImageBind model
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ModelStatusSection storeDirectory={settings.storeDirectory} />
            </CardContent>
          </Card>

          {/* File System Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                  <FolderOpen size={20} />
                </div>
                <div>
                  <CardTitle>File System</CardTitle>
                  <CardDescription>
                    Configure file storage and temporary directories
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Data Storage Directory
                </label>
                <input
                  type="text"
                  placeholder="Select a directory..."
                  value={settings.storeDirectory}
                  readOnly
                  className="w-full px-3 py-2 text-sm border rounded-md bg-gray-50 focus:outline-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Directory for storing AI models (ImageBind) and Vimo cache data
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Setup Wizard */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                  <SettingsIcon size={20} />
                </div>
                <div>
                  <CardTitle>Setup Wizard</CardTitle>
                  <CardDescription>
                    Re-run the initial configuration wizard to set up directories, download models, and check environment
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="text-blue-600 mt-0.5" size={16} />
                <div className="text-sm">
                  <p className="font-medium text-blue-800">
                    Setup Wizard
                  </p>
                  <p className="text-blue-700 mt-1">
                    Guide you through directory setup, AI model downloads, and environment configuration.
                  </p>
                </div>
              </div>
              
              <div className="flex justify-start">
                <Button
                  onClick={restartInitializationWizard}
                  variant="outline"
                  className="px-6 py-2"
                >
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Re-run Setup Wizard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
