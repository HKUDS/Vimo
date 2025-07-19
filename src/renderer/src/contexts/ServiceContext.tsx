import { createContext, useContext, ReactNode } from 'react';
import { useVideoRAGService } from '../hooks/useVideoRAGService';

// Create Service Status Context
interface ServiceContextType {
  serviceState: {
    isRunning: boolean;
    imagebindLoaded: boolean;
    message?: string;
    error?: string;
  };
  loading: {
    starting: boolean;
    stopping: boolean;
    checkingService: boolean;
    loadingImageBind: boolean;
    releasingImageBind: boolean;
  };
  startService: () => Promise<boolean>;
  stopService: () => Promise<boolean>;
  checkServiceStatus: () => Promise<void>;
  loadImageBind: () => Promise<boolean>;
  releaseImageBind: () => Promise<boolean>;
  checkImageBindStatus: () => Promise<void>;
}

const ServiceContext = createContext<ServiceContextType | null>(null);

export const ServiceProvider = ({ children }: { children: ReactNode }) => {
  const {
    serviceState,
    loading,
    startService,
    stopService,
    checkServiceStatus,
    loadImageBind,
    releaseImageBind,
    checkImageBindStatus
  } = useVideoRAGService();

  return (
    <ServiceContext.Provider 
      value={{
        serviceState,
        loading,
        startService,
        stopService,
        checkServiceStatus,
        loadImageBind,
        releaseImageBind,
        checkImageBindStatus
      }}
    >
      {children}
    </ServiceContext.Provider>
  );
};

export const useServiceContext = () => {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error('useServiceContext must be used within a ServiceProvider');
  }
  return context;
}; 