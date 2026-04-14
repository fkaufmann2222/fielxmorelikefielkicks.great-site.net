import React from 'react';

type FieldHeatmapProps = {
  points: Array<{ x: number; y: number }>;
  totalShots?: number;
  color?: string;
  overlaySrc?: string;
  width?: number;
  height?: number;
  showHorizontalThirds?: boolean;
  emptyMessage?: string;
  pointRadius?: number;
  overlapBucketPx?: number;
};

type RgbTuple = [number, number, number];

type PaletteStop = {
  at: number;
  color: RgbTuple;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function parseHexColor(value: string): RgbTuple | null {
  const normalized = value.trim();
  if (!normalized.startsWith('#')) {
    return null;
  }

  if (normalized.length === 4) {
    const r = Number.parseInt(`${normalized[1]}${normalized[1]}`, 16);
    const g = Number.parseInt(`${normalized[2]}${normalized[2]}`, 16);
    const b = Number.parseInt(`${normalized[3]}${normalized[3]}`, 16);

    if ([r, g, b].some((channel) => Number.isNaN(channel))) {
      return null;
    }

    return [r, g, b];
  }

  if (normalized.length === 7) {
    const r = Number.parseInt(normalized.slice(1, 3), 16);
    const g = Number.parseInt(normalized.slice(3, 5), 16);
    const b = Number.parseInt(normalized.slice(5, 7), 16);

    if ([r, g, b].some((channel) => Number.isNaN(channel))) {
      return null;
    }

    return [r, g, b];
  }

  return null;
}

function mixRgb(a: RgbTuple, b: RgbTuple, ratio: number): RgbTuple {
  const t = clamp01(ratio);

  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function createPalette(color: string): PaletteStop[] {
  const accent = parseHexColor(color) || [244, 63, 94];

  return [
    { at: 0, color: [10, 7, 26] },
    { at: 0.2, color: [45, 12, 86] },
    { at: 0.45, color: mixRgb([125, 28, 109], accent, 0.45) },
    { at: 0.7, color: [244, 114, 53] },
    { at: 0.9, color: [252, 211, 77] },
    { at: 1, color: [255, 250, 232] },
  ];
}

function samplePalette(stops: PaletteStop[], t: number): RgbTuple {
  const clamped = clamp01(t);

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const next = stops[index];

    if (clamped <= next.at) {
      const segmentRange = Math.max(0.0001, next.at - previous.at);
      const localT = (clamped - previous.at) / segmentRange;
      return mixRgb(previous.color, next.color, localT);
    }
  }

  return stops[stops.length - 1].color;
}

function buildLookupTable(stops: PaletteStop[]): Uint8ClampedArray {
  const table = new Uint8ClampedArray(256 * 3);

  for (let index = 0; index < 256; index += 1) {
    const t = index / 255;
    const sampled = samplePalette(stops, t);
    table[index * 3] = sampled[0];
    table[index * 3 + 1] = sampled[1];
    table[index * 3 + 2] = sampled[2];
  }

  return table;
}

export const FieldHeatmap = React.memo(function FieldHeatmap({
  points,
  totalShots,
  color = '#f43f5e',
  overlaySrc = '/auton-field-overlay.svg',
  width = 1000,
  height = 540,
  showHorizontalThirds = false,
  emptyMessage = 'No shot attempts captured yet.',
  pointRadius = 36,
}: FieldHeatmapProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const normalizedPoints = React.useMemo(() => {
    return points.map((point) => {
      return {
        x: clamp01(point.x),
        y: clamp01(point.y),
      };
    });
  }, [points]);

  const colorLookup = React.useMemo(() => {
    return buildLookupTable(createPalette(color));
  }, [color]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const densityCanvas = document.createElement('canvas');
    densityCanvas.width = width;
    densityCanvas.height = height;

    const densityCtx = densityCanvas.getContext('2d');
    if (!densityCtx) {
      return;
    }

    densityCtx.clearRect(0, 0, width, height);
    densityCtx.globalCompositeOperation = 'lighter';

    normalizedPoints.forEach((point) => {
      const px = point.x * width;
      const py = point.y * height;
      const gradient = densityCtx.createRadialGradient(px, py, 0, px, py, pointRadius);
      gradient.addColorStop(0, 'rgba(255,255,255,0.21)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      densityCtx.fillStyle = gradient;
      densityCtx.fillRect(px - pointRadius, py - pointRadius, pointRadius * 2, pointRadius * 2);
    });

    const densityImage = densityCtx.getImageData(0, 0, width, height);
    const pixels = densityImage.data;
    let maxAlpha = 0;

    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > maxAlpha) {
        maxAlpha = pixels[index];
      }
    }

    if (maxAlpha > 0) {
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        if (alpha === 0) {
          continue;
        }

        const normalized = alpha / maxAlpha;
        const intensity = Math.pow(normalized, 0.72);
        if (intensity < 0.03) {
          pixels[index + 3] = 0;
          continue;
        }

        const lookupIndex = Math.min(255, Math.max(0, Math.round(intensity * 255)));
        pixels[index] = colorLookup[lookupIndex * 3];
        pixels[index + 1] = colorLookup[lookupIndex * 3 + 1];
        pixels[index + 2] = colorLookup[lookupIndex * 3 + 2];
        pixels[index + 3] = Math.min(255, Math.round(255 * Math.pow(intensity, 0.9) * 1.05));
      }
    }

    densityCtx.putImageData(densityImage, 0, 0);

    const renderCtx = canvas.getContext('2d');
    if (!renderCtx) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    renderCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    renderCtx.clearRect(0, 0, width, height);
    renderCtx.drawImage(densityCanvas, 0, 0, width, height);
  }, [colorLookup, height, normalizedPoints, pointRadius, width]);

  const resolvedTotalShots = typeof totalShots === 'number' ? totalShots : normalizedPoints.length;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-950/70" style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />

        <img
          src={overlaySrc}
          alt="Field overlay"
          className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-65"
        />

        {showHorizontalThirds && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-0 right-0 top-1/3 border-t border-dashed border-slate-400/70" />
            <div className="absolute left-0 right-0 top-2/3 border-t border-dashed border-slate-400/70" />
          </div>
        )}
      </div>

      {resolvedTotalShots === 0 && <p className="text-xs text-slate-500">{emptyMessage}</p>}
    </div>
  );
});

FieldHeatmap.displayName = 'FieldHeatmap';
