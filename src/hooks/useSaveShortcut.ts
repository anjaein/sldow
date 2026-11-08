import { useEffect, useRef } from 'react';

export function useSaveShortcut(onSave: () => void | Promise<void>) {
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.code !== 'KeyS') return;
      event.preventDefault();
      if (!event.isComposing && !event.repeat) void onSaveRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
