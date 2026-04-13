"use client";

import { cn } from "@/lib/utils";

interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * How centering works:
 *
 * The <input> is h-5 (20 px).  Both the WebKit runnable-track and the Firefox
 * moz-range-track are set to h-full / h-5 (also 20 px) and are transparent.
 * Because the track spans the full input height, the browser places the thumb
 * at the vertical centre of the track — i.e. at y = 10 px.
 *
 * The visual track is a linear-gradient band that is exactly 8 px tall,
 * positioned at "center" (background-position: 50% 50%), which places it at
 * y = (20 - 8) / 2 = 6 px → centre at y = 10 px — perfectly aligned with the
 * thumb centre, in every browser, with no margin-top hacks.
 */
function Slider({
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  onValueChange,
  className,
  disabled = false,
}: SliderProps) {
  const current = value?.[0] ?? defaultValue?.[0] ?? min;
  const pct = ((current - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={current}
      disabled={disabled}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
      className={cn(
        "w-full cursor-pointer appearance-none outline-none",
        // 20 px height = touch-friendly click area AND matches thumb height
        "h-5",
        "disabled:cursor-not-allowed disabled:opacity-50",

        // ── WebKit / Blink (Chrome, Safari, Edge) ─────────────────────────
        // Full-height transparent track → thumb auto-centres at y = 10 px
        "[&::-webkit-slider-runnable-track]:h-full",
        "[&::-webkit-slider-runnable-track]:bg-transparent",
        // Thumb
        "[&::-webkit-slider-thumb]:appearance-none",
        "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5",
        "[&::-webkit-slider-thumb]:rounded-full",
        "[&::-webkit-slider-thumb]:bg-orange-500",
        "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white",
        "[&::-webkit-slider-thumb]:shadow-md",
        "[&::-webkit-slider-thumb]:cursor-pointer",
        "[&::-webkit-slider-thumb]:transition-shadow",
        "[&::-webkit-slider-thumb:hover]:shadow-[0_0_0_6px_rgba(249,115,22,0.25)]",
        "[&::-webkit-slider-thumb:active]:shadow-[0_0_0_6px_rgba(249,115,22,0.35)]",

        // ── Firefox ───────────────────────────────────────────────────────
        // Full-height transparent track + transparent progress → thumb centres
        "[&::-moz-range-track]:h-5",
        "[&::-moz-range-track]:bg-transparent",
        "[&::-moz-range-progress]:bg-transparent",
        // Thumb
        "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5",
        "[&::-moz-range-thumb]:rounded-full",
        "[&::-moz-range-thumb]:bg-orange-500",
        "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white",
        "[&::-moz-range-thumb]:shadow-md",
        "[&::-moz-range-thumb]:cursor-pointer",

        className
      )}
      style={{
        // Visual track: 8 px gradient band centred in the 20 px element.
        // background-size 100% 8px  → band is 8 px tall
        // background-position center → top offset = (20 - 8) / 2 = 6 px
        // Band centre = 6 + 4 = 10 px = thumb centre ✓
        background: `linear-gradient(to right, #f97316 ${pct}%, #e5e7eb ${pct}%) center / 100% 8px no-repeat`,
      }}
    />
  );
}

export { Slider };
