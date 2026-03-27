import { MetricKey, StripKey } from './types';

export const AUTON_FIELD_WIDTH = 1000;
export const AUTON_FIELD_HEIGHT = 540;
export const AUTON_FIELD_OVERLAY_SRC = '/auton-field-overlay.svg';
export const PATH_SAMPLE_COUNT = 45;
export const AUTON_HEATMAP_COLS = 12;
export const AUTON_HEATMAP_ROWS = 6;
export const TELEOP_HEATMAP_COLS = 24;
export const TELEOP_HEATMAP_ROWS = 12;
export const DATA_REFRESH_DEBOUNCE_MS = 250;
export const NOTE_SUMMARY_DEBOUNCE_MS = 450;

export const STRIP_ORDER: Array<{ key: StripKey; label: string; minY: number; maxY: number }> = [
  { key: 'top', label: 'Top Start Strip', minY: 0, maxY: 1 / 3 },
  { key: 'middle', label: 'Middle Start Strip', minY: 1 / 3, maxY: 2 / 3 },
  { key: 'bottom', label: 'Bottom Start Strip', minY: 2 / 3, maxY: 1 },
];

export const METRIC_META: Record<MetricKey, { label: string; color: string }> = {
  total_points: { label: 'Total EPA (unitless)', color: '#60a5fa' },
  auto_points: { label: 'Auto', color: '#34d399' },
  teleop_points: { label: 'Teleop', color: '#f59e0b' },
  endgame_points: { label: 'Endgame', color: '#f472b6' },
};
