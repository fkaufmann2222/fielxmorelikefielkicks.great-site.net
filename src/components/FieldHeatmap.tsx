import React from 'react';

type FieldHeatmapProps = {
  bins: number[];
  cols: number;
  rows: number;
  maxBin: number;
  totalShots: number;
  color?: string;
  overlaySrc?: string;
  width?: number;
  height?: number;
  showHorizontalThirds?: boolean;
  emptyMessage?: string;
};

export const FieldHeatmap = React.memo(function FieldHeatmap({
  bins,
  cols,
  rows,
  maxBin,
  totalShots,
  color = '#f43f5e',
  overlaySrc = '/auton-field-overlay.svg',
  width = 1000,
  height = 540,
  showHorizontalThirds = false,
  emptyMessage = 'No shot attempts captured yet.',
}: FieldHeatmapProps) {
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-lg border border-slate-700 bg-slate-950/70">
        <image
          href={overlaySrc}
          x="0"
          y="0"
          width={width}
          height={height}
          preserveAspectRatio="none"
          opacity="0.95"
        />

        {showHorizontalThirds && (
          <>
            <line
              x1="0"
              y1={height / 3}
              x2={width}
              y2={height / 3}
              stroke="#64748b"
              strokeDasharray="8 6"
              strokeWidth="1"
              opacity="0.7"
            />
            <line
              x1="0"
              y1={(height * 2) / 3}
              x2={width}
              y2={(height * 2) / 3}
              stroke="#64748b"
              strokeDasharray="8 6"
              strokeWidth="1"
              opacity="0.7"
            />
          </>
        )}

        {bins.map((count, index) => {
          if (count <= 0 || maxBin <= 0) {
            return null;
          }

          const col = index % cols;
          const row = Math.floor(index / cols);
          const cellWidth = width / cols;
          const cellHeight = height / rows;
          const intensity = count / maxBin;

          return (
            <rect
              key={`bin-${index}`}
              x={col * cellWidth}
              y={row * cellHeight}
              width={cellWidth}
              height={cellHeight}
              fill={color}
              opacity={0.12 + intensity * 0.58}
            />
          );
        })}
      </svg>

      {totalShots === 0 && <p className="text-xs text-slate-500">{emptyMessage}</p>}
    </div>
  );
});

FieldHeatmap.displayName = 'FieldHeatmap';
