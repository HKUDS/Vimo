export function DragArea() {
  return (
    <div
      className="draggable-area h-8 w-full"
      style={{
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      } as any}
    />
  );
}
