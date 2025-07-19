import { useState, useEffect, useCallback } from 'react';

export const useResizable = (initialHeight: number = 200) => {
  const [inputAreaHeight, setInputAreaHeight] = useState(initialHeight);
  const [isDragging, setIsDragging] = useState(false);
  const [realTimeHeight, setRealTimeHeight] = useState(initialHeight);

  // Sync realTimeHeight and inputAreaHeight
  useEffect(() => {
    setRealTimeHeight(inputAreaHeight);
  }, [inputAreaHeight]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const windowHeight = window.innerHeight;
      const newHeight = windowHeight - e.clientY - 32; // 32px is the height of the top drag area
      const clampedHeight = Math.max(150, Math.min(500, newHeight)); // Limit between 150-500px
      setRealTimeHeight(clampedHeight); // Update height in real time
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setInputAreaHeight(realTimeHeight); // Save final height after dragging
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, realTimeHeight]);

  const getCurrentHeight = () => isDragging ? realTimeHeight : inputAreaHeight;

  return {
    inputAreaHeight,
    isDragging,
    realTimeHeight,
    handleResizeMouseDown,
    getCurrentHeight,
  };
}; 