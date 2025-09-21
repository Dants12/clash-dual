import React, { useEffect, useRef } from 'react';

type CrashDualCanvasProps = {
  mA: number;
  mB: number;
  targetA: number;
  targetB: number;
  phase: string;
};

type PlaneGraphic = {
  fuselage: Path2D;
  wings: Path2D;
  tail: Path2D;
  cockpit: Path2D;
  fins?: Path2D;
  bounds: {
    nose: number;
    tail: number;
    top: number;
    bottom: number;
  };
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
  const planeGraphicsRef = useRef<{ planeA: PlaneGraphic; planeB: PlaneGraphic } | null>(null);

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

    const createPlaneA = (): PlaneGraphic => {
      const wings = new Path2D();
      wings.moveTo(-6, 0);
      wings.lineTo(-28, -16);
      wings.lineTo(-14, -4);
      wings.lineTo(-34, 0);
      wings.lineTo(-14, 4);
      wings.lineTo(-28, 16);
      wings.closePath();

      const tail = new Path2D();
      tail.moveTo(-18, -3);
      tail.lineTo(-26, -16);
      tail.lineTo(-20, -3);
      tail.lineTo(-26, 16);
      tail.lineTo(-18, 3);
      tail.closePath();

      const fuselage = new Path2D();
      fuselage.moveTo(34, 0);
      fuselage.quadraticCurveTo(20, -7, 10, -7);
      fuselage.lineTo(-14, -5);
      fuselage.quadraticCurveTo(-28, -2, -30, 0);
      fuselage.quadraticCurveTo(-28, 2, -14, 5);
      fuselage.lineTo(10, 7);
      fuselage.quadraticCurveTo(20, 7, 34, 0);
      fuselage.closePath();

      const cockpit = new Path2D();
      cockpit.moveTo(11, -3.5);
      cockpit.quadraticCurveTo(20, 0, 11, 3.5);
      cockpit.lineTo(6, 3.5);
      cockpit.quadraticCurveTo(13, 0, 6, -3.5);
      cockpit.closePath();

      const fins = new Path2D();
      fins.moveTo(-2, -3);
      fins.lineTo(10, -10);
      fins.lineTo(6, -1);
      fins.lineTo(10, 10);
      fins.lineTo(-2, 3);
      fins.closePath();

      return {
        fuselage,
        wings,
        tail,
        cockpit,
        fins,
        bounds: { nose: 34, tail: 30, top: 20, bottom: 20 },
      };
    };

    const createPlaneB = (): PlaneGraphic => {
      const wings = new Path2D();
      wings.moveTo(-2, 0);
      wings.lineTo(-20, -14);
      wings.lineTo(-8, -3);
      wings.lineTo(-26, 0);
      wings.lineTo(-8, 3);
      wings.lineTo(-20, 14);
      wings.closePath();

      const tail = new Path2D();
      tail.moveTo(-12, -4);
      tail.lineTo(-4, -18);
      tail.lineTo(-2, -4);
      tail.lineTo(-2, 4);
      tail.lineTo(-4, 18);
      tail.lineTo(-12, 4);
      tail.closePath();

      const fuselage = new Path2D();
      fuselage.moveTo(30, 0);
      fuselage.quadraticCurveTo(18, -9, 8, -9);
      fuselage.lineTo(-12, -7);
      fuselage.quadraticCurveTo(-26, -4, -28, 0);
      fuselage.quadraticCurveTo(-26, 4, -12, 7);
      fuselage.lineTo(8, 9);
      fuselage.quadraticCurveTo(18, 9, 30, 0);
      fuselage.closePath();

      const cockpit = new Path2D();
      cockpit.moveTo(8, -3);
      cockpit.quadraticCurveTo(14, 0, 8, 3);
      cockpit.lineTo(3.5, 3);
      cockpit.quadraticCurveTo(10, 0, 3.5, -3);
      cockpit.closePath();

      return {
        fuselage,
        wings,
        tail,
        cockpit,
        bounds: { nose: 30, tail: 28, top: 18, bottom: 22 },
      };
    };

    const ensurePlaneGraphics = () => {
      if (!planeGraphicsRef.current) {
        if (typeof Path2D === 'undefined') {
          return null;
        }
        planeGraphicsRef.current = { planeA: createPlaneA(), planeB: createPlaneB() };
      }
      return planeGraphicsRef.current;
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
      ctx.fill(graphic.wings);
      ctx.strokeStyle = palette.trim;
      ctx.lineWidth = 0.9;
      ctx.stroke(graphic.wings);

      ctx.fillStyle = palette.tail;
      ctx.fill(graphic.tail);
      ctx.stroke(graphic.tail);

      if (graphic.fins) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = palette.tail;
        ctx.fill(graphic.fins);
        ctx.globalAlpha = 1;
      }

      ctx.shadowColor = 'rgba(12, 16, 32, 0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      const fuselageGradient = ctx.createLinearGradient(graphic.bounds.nose, 0, -graphic.bounds.tail, 0);
      fuselageGradient.addColorStop(0, palette.bodyLight);
      fuselageGradient.addColorStop(1, palette.bodyDark);
      ctx.fillStyle = fuselageGradient;
      ctx.fill(graphic.fuselage);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = palette.trim;
      ctx.lineWidth = 1.2;
      ctx.stroke(graphic.fuselage);

      ctx.fillStyle = palette.cockpit;
      ctx.fill(graphic.cockpit);

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

  return <canvas ref={ref} width={900} height={460} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
