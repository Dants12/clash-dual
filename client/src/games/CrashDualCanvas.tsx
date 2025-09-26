import { useEffect, useRef } from 'react';

type CrashDualCanvasProps = {
  mA: number;
  mB: number;
  targetA: number;
  targetB: number;
  phase: string;
};

type PathCommand =
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'lineTo'; x: number; y: number }
  | { type: 'quadraticCurveTo'; cpx: number; cpy: number; x: number; y: number }
  | { type: 'closePath' };

type PlaneShape = Path2D | PathCommand[];

type PlaneGraphic = {
  fuselage: PlaneShape;
  wings: PlaneShape;
  tail: PlaneShape;
  cockpit: PlaneShape;
  fins?: PlaneShape;
  bounds: {
    nose: number;
    tail: number;
    top: number;
    bottom: number;
  };
};

type PlaneCommandMap = {
  fuselage: PathCommand[];
  wings: PathCommand[];
  tail: PathCommand[];
  cockpit: PathCommand[];
  fins?: PathCommand[];
};

const planeACommands: PlaneCommandMap = {
  wings: [
    { type: 'moveTo', x: -6, y: 0 },
    { type: 'lineTo', x: -28, y: -16 },
    { type: 'lineTo', x: -14, y: -4 },
    { type: 'lineTo', x: -34, y: 0 },
    { type: 'lineTo', x: -14, y: 4 },
    { type: 'lineTo', x: -28, y: 16 },
    { type: 'closePath' },
  ],
  tail: [
    { type: 'moveTo', x: -18, y: -3 },
    { type: 'lineTo', x: -26, y: -16 },
    { type: 'lineTo', x: -20, y: -3 },
    { type: 'lineTo', x: -26, y: 16 },
    { type: 'lineTo', x: -18, y: 3 },
    { type: 'closePath' },
  ],
  fuselage: [
    { type: 'moveTo', x: 34, y: 0 },
    { type: 'quadraticCurveTo', cpx: 20, cpy: -7, x: 10, y: -7 },
    { type: 'lineTo', x: -14, y: -5 },
    { type: 'quadraticCurveTo', cpx: -28, cpy: -2, x: -30, y: 0 },
    { type: 'quadraticCurveTo', cpx: -28, cpy: 2, x: -14, y: 5 },
    { type: 'lineTo', x: 10, y: 7 },
    { type: 'quadraticCurveTo', cpx: 20, cpy: 7, x: 34, y: 0 },
    { type: 'closePath' },
  ],
  cockpit: [
    { type: 'moveTo', x: 11, y: -3.5 },
    { type: 'quadraticCurveTo', cpx: 20, cpy: 0, x: 11, y: 3.5 },
    { type: 'lineTo', x: 6, y: 3.5 },
    { type: 'quadraticCurveTo', cpx: 13, cpy: 0, x: 6, y: -3.5 },
    { type: 'closePath' },
  ],
  fins: [
    { type: 'moveTo', x: -2, y: -3 },
    { type: 'lineTo', x: 10, y: -10 },
    { type: 'lineTo', x: 6, y: -1 },
    { type: 'lineTo', x: 10, y: 10 },
    { type: 'lineTo', x: -2, y: 3 },
    { type: 'closePath' },
  ],
};

const planeBCommands: PlaneCommandMap = {
  wings: [
    { type: 'moveTo', x: -2, y: 0 },
    { type: 'lineTo', x: -20, y: -14 },
    { type: 'lineTo', x: -8, y: -3 },
    { type: 'lineTo', x: -26, y: 0 },
    { type: 'lineTo', x: -8, y: 3 },
    { type: 'lineTo', x: -20, y: 14 },
    { type: 'closePath' },
  ],
  tail: [
    { type: 'moveTo', x: -12, y: -4 },
    { type: 'lineTo', x: -4, y: -18 },
    { type: 'lineTo', x: -2, y: -4 },
    { type: 'lineTo', x: -2, y: 4 },
    { type: 'lineTo', x: -4, y: 18 },
    { type: 'lineTo', x: -12, y: 4 },
    { type: 'closePath' },
  ],
  fuselage: [
    { type: 'moveTo', x: 30, y: 0 },
    { type: 'quadraticCurveTo', cpx: 18, cpy: -9, x: 8, y: -9 },
    { type: 'lineTo', x: -12, y: -7 },
    { type: 'quadraticCurveTo', cpx: -26, cpy: -4, x: -28, y: 0 },
    { type: 'quadraticCurveTo', cpx: -26, cpy: 4, x: -12, y: 7 },
    { type: 'lineTo', x: 8, y: 9 },
    { type: 'quadraticCurveTo', cpx: 18, cpy: 9, x: 30, y: 0 },
    { type: 'closePath' },
  ],
  cockpit: [
    { type: 'moveTo', x: 8, y: -3 },
    { type: 'quadraticCurveTo', cpx: 14, cpy: 0, x: 8, y: 3 },
    { type: 'lineTo', x: 3.5, y: 3 },
    { type: 'quadraticCurveTo', cpx: 10, cpy: 0, x: 3.5, y: -3 },
    { type: 'closePath' },
  ],
};

type PlanePalette = {
  bodyLight: string;
  bodyDark: string;
  wings: string;
  tail: string;
  cockpit: string;
  trim: string;
  accent: string;
  glow: string;
};

export default function CrashDualCanvas({ mA, mB, targetA, targetB, phase }: CrashDualCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const metricsRef = useRef({ mA, mB, targetA, targetB, phase });
  const planeGraphicsRef = useRef<
    { planeA: PlaneGraphic; planeB: PlaneGraphic; usesPath2D: boolean } | null
  >(null);

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

    const applyCommandsToTarget = (target: CanvasRenderingContext2D | Path2D, commands: PathCommand[]) => {
      for (const command of commands) {
        switch (command.type) {
          case 'moveTo':
            target.moveTo(command.x, command.y);
            break;
          case 'lineTo':
            target.lineTo(command.x, command.y);
            break;
          case 'quadraticCurveTo':
            target.quadraticCurveTo(command.cpx, command.cpy, command.x, command.y);
            break;
          case 'closePath':
            target.closePath();
            break;
        }
      }
    };

    const createShape = (commands: PathCommand[], usePath2D: boolean): PlaneShape => {
      if (usePath2D && typeof Path2D !== 'undefined') {
        const path = new Path2D();
        applyCommandsToTarget(path, commands);
        return path;
      }
      return commands;
    };

    const createPlaneA = (usePath2D: boolean): PlaneGraphic => ({
      fuselage: createShape(planeACommands.fuselage, usePath2D),
      wings: createShape(planeACommands.wings, usePath2D),
      tail: createShape(planeACommands.tail, usePath2D),
      cockpit: createShape(planeACommands.cockpit, usePath2D),
      fins: planeACommands.fins ? createShape(planeACommands.fins, usePath2D) : undefined,
      bounds: { nose: 34, tail: 30, top: 20, bottom: 20 },
    });

    const createPlaneB = (usePath2D: boolean): PlaneGraphic => ({
      fuselage: createShape(planeBCommands.fuselage, usePath2D),
      wings: createShape(planeBCommands.wings, usePath2D),
      tail: createShape(planeBCommands.tail, usePath2D),
      cockpit: createShape(planeBCommands.cockpit, usePath2D),
      bounds: { nose: 30, tail: 28, top: 18, bottom: 22 },
    });

    const ensurePlaneGraphics = () => {
      const hasPath2DSupport = typeof Path2D !== 'undefined';
      const cached = planeGraphicsRef.current;
      if (!cached || cached.usesPath2D !== hasPath2DSupport) {
        planeGraphicsRef.current = {
          planeA: createPlaneA(hasPath2DSupport),
          planeB: createPlaneB(hasPath2DSupport),
          usesPath2D: hasPath2DSupport,
        };
      }
      return planeGraphicsRef.current;
    };

    const isPath2DShape = (shape: PlaneShape): shape is Path2D =>
      typeof Path2D !== 'undefined' && shape instanceof Path2D;

    const fillShape = (shape: PlaneShape) => {
      if (isPath2DShape(shape)) {
        ctx.fill(shape);
      } else {
        ctx.beginPath();
        applyCommandsToTarget(ctx, shape);
        ctx.fill();
      }
    };

    const strokeShape = (shape: PlaneShape) => {
      if (isPath2DShape(shape)) {
        ctx.stroke(shape);
      } else {
        ctx.beginPath();
        applyCommandsToTarget(ctx, shape);
        ctx.stroke();
      }
    };

    const drawPlane = (
      graphic: PlaneGraphic,
      palette: PlanePalette,
      {
        x,
        y,
        scale,
        rotation,
      }: { x: number; y: number; scale: number; rotation: number }
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (palette.glow) {
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.ellipse(-graphic.bounds.tail - 6, 0, 7, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = palette.glow;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      const wingGradient = ctx.createLinearGradient(-graphic.bounds.tail, -8, 12, 8);
      wingGradient.addColorStop(0, palette.wings);
      wingGradient.addColorStop(1, palette.wings + 'AA');
      ctx.fillStyle = wingGradient;
      fillShape(graphic.wings);
      ctx.strokeStyle = palette.trim;
      ctx.lineWidth = 0.9;
      strokeShape(graphic.wings);

      ctx.fillStyle = palette.tail;
      fillShape(graphic.tail);
      strokeShape(graphic.tail);

      if (graphic.fins) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = palette.tail;
        fillShape(graphic.fins);
        ctx.globalAlpha = 1;
      }

      ctx.shadowColor = 'rgba(12, 16, 32, 0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      const fuselageGradient = ctx.createLinearGradient(graphic.bounds.nose, 0, -graphic.bounds.tail, 0);
      fuselageGradient.addColorStop(0, palette.bodyLight);
      fuselageGradient.addColorStop(1, palette.bodyDark);
      ctx.fillStyle = fuselageGradient;
      fillShape(graphic.fuselage);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = palette.trim;
      ctx.lineWidth = 1.2;
      strokeShape(graphic.fuselage);

      ctx.fillStyle = palette.cockpit;
      fillShape(graphic.cockpit);

      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(-8, -2.4);
      ctx.quadraticCurveTo(12, -6, graphic.bounds.nose - 6, -1.6);
      ctx.quadraticCurveTo(8, -3.6, -8, -1.2);
      ctx.closePath();
      ctx.fillStyle = palette.accent;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1.4;
      ctx.moveTo(-14, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();

      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(-12, -2.2, 2.2, 1.4, 0, 0, Math.PI * 2);
      ctx.ellipse(-12, 2.2, 2.2, 1.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffffb0';
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.fillStyle = '#ffffff80';
      ctx.ellipse(graphic.bounds.nose - 6, 0, 1.6, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

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

    const container = (canvas.parentElement as HTMLElement | null) ?? canvas;

    const getContentBoxSize = (entry?: ResizeObserverEntry) => {
      const devicePixelRatio = window.devicePixelRatio || 1;

      if (entry) {
        const contentBoxSize = Array.isArray(entry.contentBoxSize)
          ? entry.contentBoxSize[0]
          : entry.contentBoxSize;
        if (contentBoxSize && typeof contentBoxSize.inlineSize === 'number' && typeof contentBoxSize.blockSize === 'number') {
          return { width: contentBoxSize.inlineSize, height: contentBoxSize.blockSize };
        }
        const { width: entryWidth, height: entryHeight } = entry.contentRect;
        if (entryWidth && entryHeight) {
          return { width: entryWidth, height: entryHeight };
        }
      }

      if (container instanceof HTMLElement) {
        const style = window.getComputedStyle(container);
        const paddingX =
          (parseFloat(style.paddingLeft || '0') || 0) + (parseFloat(style.paddingRight || '0') || 0);
        const paddingY =
          (parseFloat(style.paddingTop || '0') || 0) + (parseFloat(style.paddingBottom || '0') || 0);
        const width = container.clientWidth - paddingX;
        const height = container.clientHeight - paddingY;
        return {
          width: width > 0 ? width : canvas.clientWidth || canvas.width / devicePixelRatio,
          height: height > 0 ? height : canvas.clientHeight || canvas.height / devicePixelRatio,
        };
      }

      return {
        width: canvas.clientWidth || canvas.width / devicePixelRatio,
        height: canvas.clientHeight || canvas.height / devicePixelRatio,
      };
    };

    const handleResize = () => {
      const { width, height } = getContentBoxSize();
      if (width > 0 && height > 0) {
        applyScale(width, height);
      }
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === container) {
            const { width, height } = getContentBoxSize(entry);
            if (width > 0 && height > 0) {
              applyScale(width, height);
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

      const leftMargin = Math.max(24, width * 0.05);
      const rightMargin = Math.max(32, width * 0.08);
      const topMargin = Math.max(28, height * 0.08);
      const bottomMargin = Math.max(24, height * 0.1);
      const baselineY = height - bottomMargin;
      const descentLimit = bottomMargin * 0.7;
      const climbRange = baselineY - topMargin;

      const toY = (m: number) => {
        const logScaled = Math.log(Math.max(m, 1e-6)) * 70;
        const limited = Math.max(-descentLimit, Math.min(climbRange, logScaled));
        const raw = baselineY - limited;
        return Math.min(baselineY + descentLimit, Math.max(topMargin, raw));
      };

      const chartLeftX = leftMargin;
      const chartRightX = width - rightMargin;

      const planeGraphics = ensurePlaneGraphics();
      const yA = toY(currentMA);
      const yB = toY(currentMB);
      const targetAY = toY(currentTargetA);
      const targetBY = toY(currentTargetB);

      let planeAConfig: { x: number; y: number; scale: number; rotation: number } | null = null;
      let planeBConfig: { x: number; y: number; scale: number; rotation: number } | null = null;
      let paletteA: PlanePalette | null = null;
      let paletteB: PlanePalette | null = null;

      if (planeGraphics) {
        const clampPlaneY = (value: number, graphic: PlaneGraphic, scale: number) => {
          const minY = topMargin + graphic.bounds.top * scale;
          const maxY = Math.min(height - graphic.bounds.bottom * scale, baselineY + descentLimit);
          return Math.min(maxY, Math.max(minY, value));
        };

        const planeScaleBase = Math.min(width / 720, height / 420);
        const planeAScale = Math.max(0.65, Math.min(1.2, planeScaleBase));
        const planeBScale = Math.max(0.6, Math.min(1.1, planeScaleBase * 0.94));

        const planeAY = clampPlaneY(yA, planeGraphics.planeA, planeAScale);
        const planeBY = clampPlaneY(yB, planeGraphics.planeB, planeBScale);

        const planeAX = chartRightX - planeGraphics.planeA.bounds.nose * planeAScale;
        const tailAX = planeAX - planeGraphics.planeA.bounds.tail * planeAScale;
        const separation = Math.max(24, width * 0.04);
        let planeBX = tailAX - separation - planeGraphics.planeB.bounds.nose * planeBScale;
        const minPlaneBX = chartLeftX + planeGraphics.planeB.bounds.tail * planeBScale;
        if (planeBX < minPlaneBX) {
          planeBX = minPlaneBX;
        }

        const planeAAngle = Math.min(0.35, Math.max(-1.15, Math.atan2(planeAY - baselineY, planeAX - chartLeftX)));
        const planeBAngle = Math.min(0.5, Math.max(-1.35, Math.atan2(planeBY - baselineY, planeBX - chartLeftX) - 0.12));

        planeAConfig = { x: planeAX, y: planeAY, scale: planeAScale, rotation: planeAAngle };
        planeBConfig = { x: planeBX, y: planeBY, scale: planeBScale, rotation: planeBAngle };

        paletteA = {
          bodyLight: '#c2e9ff',
          bodyDark: '#4076d6',
          wings: '#79b4ff',
          tail: '#4e7dd8',
          cockpit: '#0f234e',
          trim: 'rgba(13, 31, 66, 0.75)',
          accent: '#9dd3ff',
          glow: 'rgba(132, 204, 255, 0.9)',
        };

        paletteB = {
          bodyLight: '#ffd1ec',
          bodyDark: '#d95493',
          wings: '#ff92c8',
          tail: '#d4488a',
          cockpit: '#3e0f2b',
          trim: 'rgba(92, 10, 45, 0.8)',
          accent: '#ffbad7',
          glow: 'rgba(255, 160, 214, 0.85)',
        };
      }

      // Targets
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#7c89b6';
      ctx.beginPath();
      ctx.moveTo(chartLeftX, targetAY);
      ctx.lineTo(chartRightX, targetAY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(chartLeftX, targetBY);
      ctx.lineTo(chartRightX, targetBY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (planeGraphics && planeAConfig && planeBConfig && paletteA && paletteB) {
        drawPlane(planeGraphics.planeB, paletteB, planeBConfig);
        drawPlane(planeGraphics.planeA, paletteA, planeAConfig);
      }

      // Labels
      ctx.font = `${fontSize}px/1.4 "Inter", "Segoe UI", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#9bb1ff';
      const labelX = chartLeftX;
      const labelY = Math.max(12, topMargin * 0.35);
      const labelSpacing = fontSize + 6;
      ctx.fillText(`A ${currentMA.toFixed(2)}x → ${currentTargetA.toFixed(2)}x`, labelX, labelY);
      ctx.fillStyle = '#ffb1cf';
      ctx.fillText(`B ${currentMB.toFixed(2)}x → ${currentTargetB.toFixed(2)}x`, labelX, labelY + labelSpacing);
      ctx.fillStyle = '#7992d4';
      ctx.fillText(`Phase: ${currentPhase}`, labelX, labelY + labelSpacing * 2);

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, []);

  return <canvas ref={ref} width={900} height={460} style={{ width: '900px', height: '460px', display: 'block' }} />;
}
