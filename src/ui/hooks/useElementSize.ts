import { useEffect, useState, type RefObject } from 'react';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Tracks an element's content-box size in CSS pixels.
 *
 * The canvas is sized by CSS and must follow the layout, so its pixel buffer
 * is driven by an observer rather than by window resize events.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const update = (width: number, height: number) => {
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const box = entry.contentRect;
      update(box.width, box.height);
    });

    observer.observe(element);
    const rect = element.getBoundingClientRect();
    update(rect.width, rect.height);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}
