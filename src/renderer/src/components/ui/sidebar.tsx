import * as React from 'react';
import { cn } from '../../lib/utils';

interface SidebarProviderProps extends React.ComponentProps<'div'> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

const SidebarContext = React.createContext<{
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  width: number;
  setWidth: (width: number) => void;
} | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }
  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  defaultWidth = 240, // 15rem = 240px (minimum width)
  minWidth = 240,
  maxWidth = 480,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const [_open, _setOpen] = React.useState(defaultOpen);
  const [width, setWidth] = React.useState(defaultWidth);

  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
    },
    [setOpenProp, open],
  );

  const toggleSidebar = React.useCallback(() => {
    setOpen((open) => !open);
  }, [setOpen]);

  const state: 'expanded' | 'collapsed' = open ? 'expanded' : 'collapsed';

  const contextValue = React.useMemo(
    () => ({
      state,
      open,
      setOpen,
      toggleSidebar,
      width,
      setWidth: (newWidth: number) => {
        const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        setWidth(clampedWidth);
      },
    }),
    [state, open, setOpen, toggleSidebar, width, minWidth, maxWidth],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        style={
          {
            '--sidebar-width': `${width}px`,
            '--sidebar-width-icon': '3rem',
            ...style,
          } as React.CSSProperties
        }
        className={cn('flex min-h-svh w-full', className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

// 拖拽调整组件
function SidebarResizer() {
  const { setWidth } = useSidebar();
  const [isDragging, setIsDragging] = React.useState(false);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setWidth]);

  return (
    <div
      className={cn(
        'absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-500/30 transition-all duration-200 group',
        isDragging && 'bg-blue-500/50',
      )}
      onMouseDown={handleMouseDown}
      style={{ zIndex: 50 }}
    >
      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-gray-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
    </div>
  );
}

function Sidebar({
  side = 'left',
  collapsible = 'icon',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right';
  collapsible?: 'offcanvas' | 'icon' | 'none';
}) {
  return (
    <div
      className={cn(
        'bg-sidebar text-sidebar-foreground flex h-full flex-col border-r relative',
        className,
      )}
      style={{ width: 'var(--sidebar-width)' }}
      {...props}
    >
      {children}
      <SidebarResizer />
    </div>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      className={cn('flex flex-1 flex-col overflow-hidden', className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col gap-2 p-2', className)} {...props} />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-2 p-2 mt-auto', className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-2 overflow-auto p-2', className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul className={cn('flex flex-col gap-1 min-h-0', className)} {...props} />
  );
}

function SidebarMenuButton({
  className,
  isActive = false,
  children,
  ...props
}: React.ComponentProps<'button'> & { isActive?: boolean }) {
  return (
    <button
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
        isActive && 'bg-accent text-accent-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export {
  Sidebar,
  SidebarProvider,
  SidebarInset,
  SidebarHeader,
  SidebarFooter,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarResizer,
  useSidebar,
};
