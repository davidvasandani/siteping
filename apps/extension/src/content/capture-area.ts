import type { ScreenshotRegion } from "@siteping/core";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureArea extends Box {
  /** Where the drawn rect sits inside the area, as fractions of its size. */
  region: ScreenshotRegion;
}

const clamp = (min: number, value: number, max: number): number => Math.min(max, Math.max(min, value));

/** Four decimals, within [0, 1]: the precision the widget's own capture records. */
const fraction = (value: number): number => clamp(0, Math.round(value * 10_000) / 10_000, 1);

/**
 * The part of the viewport to keep for an annotation: the drawn rect plus
 * surrounding context, so the reader sees where on the page it is. Same
 * padding as the widget's own capture (60% of the rect, at least 48px, at
 * most 280 by 220), but clamped to the viewport instead of the document: a
 * tab capture holds only what is on screen.
 *
 * All values are CSS pixels in viewport coordinates. `null` when no part of
 * the rect is on screen.
 */
export function captureArea(rect: Box, viewport: { width: number; height: number }): CaptureArea | null {
  const visibleLeft = Math.max(0, rect.x);
  const visibleTop = Math.max(0, rect.y);
  const visibleRight = Math.min(viewport.width, rect.x + rect.width);
  const visibleBottom = Math.min(viewport.height, rect.y + rect.height);
  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return null;

  const padX = clamp(48, rect.width * 0.6, 280);
  const padY = clamp(48, rect.height * 0.6, 220);
  const x = Math.max(0, rect.x - padX);
  const y = Math.max(0, rect.y - padY);
  const width = Math.min(viewport.width, rect.x + rect.width + padX) - x;
  const height = Math.min(viewport.height, rect.y + rect.height + padY) - y;

  return {
    x,
    y,
    width,
    height,
    region: {
      xPct: fraction((visibleLeft - x) / width),
      yPct: fraction((visibleTop - y) / height),
      wPct: fraction((visibleRight - visibleLeft) / width),
      hPct: fraction((visibleBottom - visibleTop) / height),
    },
  };
}
