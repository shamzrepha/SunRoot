import React, { useEffect, useRef } from 'react';

export default function DigitalTwin() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const canvas = canvasRef.current!;
    // Placeholder: attach your renderer (three.js / pixi / custom) here and resize on container changes
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = Math.max(300, Math.floor(width));
        canvas.height = Math.max(200, Math.floor(height));
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row' }}>
        <main style={{ flex: 3 }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#111' }} />
        </main>
        <aside style={{ flex: 1, minWidth: 280, maxWidth: 420, borderLeft: '1px solid #ddd', padding: 12 }}>
          <h3>Inspector / Controls</h3>
          <div>Controls go here. On small screens this panel collapses beneath the canvas.</div>
        </aside>
      </div>
      <style>{`
        @media (max-width: 767px) {
          div[ref] { flex-direction: column }
        }
      `}</style>
    </div>
  );
}
