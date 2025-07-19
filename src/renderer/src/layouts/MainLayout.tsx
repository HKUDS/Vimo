import { useEffect, useState, useRef } from 'react';
import { Outlet } from 'react-router';
import { AppSidebar } from '../components/sidebar/app-sidebar';
import { SidebarInset, SidebarProvider } from '../components/ui/sidebar';
import { useVideoRAGService } from '../hooks/useVideoRAGService';

// Liquid glass loading overlay component
const ServiceLoadingOverlay = ({ show }: { show: boolean }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Liquid glass background - multiple gradient layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-white/60 to-purple-50/80 backdrop-blur-xl" />
      <div className="absolute inset-0 bg-gradient-to-tl from-white/40 via-transparent to-blue-100/30" />
      
      {/* Main container - liquid glass card */}
      <div className="relative bg-white/40 backdrop-blur-2xl rounded-3xl p-12 shadow-xl border border-white/30 max-w-md mx-6 transform transition-all duration-500 hover:scale-105">
        {/* Internal glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-blue-50/40 rounded-3xl" />
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-400/20 via-purple-400/20 to-blue-400/20 rounded-3xl blur-xl" />
        
        {/* Content area */}
        <div className="relative flex flex-col items-center space-y-6">
          {/* Modern loading animation */}
          <div className="relative">
            {/* Outer ring halo */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-blue-400/30 to-purple-400/30 animate-pulse absolute -inset-2" />
            {/* Active animation circle */}
            <div className="w-16 h-16 rounded-full border-4 border-transparent bg-gradient-to-r from-blue-500 to-purple-500 animate-spin relative">
              <div className="absolute inset-2 rounded-full bg-white/90 backdrop-blur-sm" />
            </div>
            {/* Center point */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
            </div>
          </div>
          
          {/* Title text */}
          <div className="text-center space-y-3">
            <h3 className="text-xl font-semibold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Awakening Vimo
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
};

export function MainLayout() {
  const { startService, loading } = useVideoRAGService();
  const [isInitializing, setIsInitializing] = useState(true);
  const hasInitializedRef = useRef(false);

  // When entering the main interface, automatically start the Python service
  useEffect(() => {
    // Avoid duplicate initialization
    if (hasInitializedRef.current) return;

    const initializeService = async () => {
      try {
        console.log('MainLayout: Starting service initialization...');
        
        // Try to start the service directly, if it is running, the API will return the corresponding status
        const success = await startService();
        
        if (success) {
          console.log('MainLayout: Python service started successfully');
        } else {
          console.error('MainLayout: Failed to start Python service');
        }
      } catch (error) {
        console.error('MainLayout: Error during service initialization:', error);
      } finally {
        // Mark initialization complete
        hasInitializedRef.current = true;
        setIsInitializing(false);
      }
    };

    initializeService();
  }, []);

  // Conditions for displaying the loading overlay
  const showLoadingOverlay = isInitializing || loading.starting;

  return (
    <>
      <SidebarProvider
        defaultWidth={240}
        minWidth={240}
        maxWidth={480}
        className="flex h-screen w-full bg-white"
      >
        <AppSidebar />
        <SidebarInset className="flex-1">
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
      
      {/* Service startup loading overlay */}
      <ServiceLoadingOverlay show={showLoadingOverlay} />
    </>
  );
}
