import React, { useEffect, useRef } from 'react';

type CrashDualCanvasProps = {
  mA: number;
  mB: number;
  targetA: number;
  targetB: number;
  phase: string;
};

export default function CrashDualCanvas({ mA, mB, targetA, targetB, phase }: CrashDualCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const metricsRef = useRef({ mA, mB, targetA, targetB, phase });

  useEffect(() => {
    metricsRef.current = { mA, mB, targetA, targetB, phase };
  }, [mA, mB, targetA, targetB, phase]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let frameId = 0;
    let layoutWidth = canvas.clientWidth || canvas.width;
    let layoutHeight = canvas.clientHeight || canvas.height;
    let fontSize = 16;

    const applyScale = (width: number, height: number) => {
      if (!width || !height) {
        return;
      }

      layoutWidth = width;
      layoutHeight = height;

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = Math.max(1, Math.round(width));
      const displayHeight = Math.max(1, Math.round(height));
      const bufferWidth = Math.max(1, Math.round(displayWidth * dpr));
      const bufferHeight = Math.max(1, Math.round(displayHeight * dpr));

      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      fontSize = Math.max(12, Math.min(18, displayWidth / 45));
    };

    const container = canvas.parentElement ?? canvas;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width || canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
      const height = rect.height || canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
      if (width && height) {
        applyScale(width, height);
      }
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === container) {
            const { width, height } = entry.contentRect;
            const nextWidth = width || canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
            const nextHeight = height || canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
            if (nextWidth && nextHeight) {
              applyScale(nextWidth, nextHeight);
            }
          }
        }
      });
      resizeObserver.observe(container);
    }

    handleResize();
    window.addEventListener('resize', handleResize);

    const draw = () => {
      const { mA: currentMA, mB: currentMB, targetA: currentTargetA, targetB: currentTargetB, phase: currentPhase } =
        metricsRef.current;

      const width = layoutWidth;
      const height = layoutHeight;

      ctx.clearRect(0, 0, width, height);

      // Grid
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#2a3a63';
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const toY = (m: number) => height - Math.min(height - 10, Math.log(Math.max(m, 1e-6)) * 70);

      // A smooth — path
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#8fd1ff';
      const yA = toY(currentMA);
      ctx.moveTo(20, height - 10);
      ctx.lineTo(width - 20, yA);
      ctx.stroke();

      // B jumpy
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff8fbd';
      const yB = toY(currentMB);
      ctx.moveTo(20, height - 10);
      ctx.lineTo(width - 20, yB);
      ctx.stroke();

      // Targets
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#7c89b6';
      ctx.beginPath();
      ctx.moveTo(20, toY(currentTargetA));
      ctx.lineTo(width - 20, toY(currentTargetA));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(20, toY(currentTargetB));
      ctx.lineTo(width - 20, toY(currentTargetB));
      ctx.stroke();
      ctx.setLineDash([]);

      // Labels
      ctx.font = `${fontSize}px/1.4 "Inter", "Segoe UI", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#9bb1ff';
      ctx.fillText(`A ${currentMA.toFixed(2)}x → ${currentTargetA.toFixed(2)}x`, 24, 18);
      ctx.fillStyle = '#ffb1cf';
      ctx.fillText(`B ${currentMB.toFixed(2)}x → ${currentTargetB.toFixed(2)}x`, 24, 36);
      ctx.fillStyle = '#7992d4';
      ctx.fillText(`Phase: ${currentPhase}`, 24, 54);

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, []);

  return <canvas ref={ref} width={900} height={460} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
