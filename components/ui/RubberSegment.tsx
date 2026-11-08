"use client";

import { useEffect, useId } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Option<T extends string> = { value: T; label: ReactNode };

export function RubberSegment<T extends string>({
  options,
  value,
  onChange,
  label,
  orientation = "horizontal",
}: {
  options: Array<Option<T>>;
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  orientation?: "horizontal" | "vertical";
}) {
  const reducedMotion = useReducedMotion();
  const animation = useAnimationControls();
  const id = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const thumbIndex = Math.max(0, selectedIndex);
  useEffect(() => {
    if (selectedIndex < 0) {
      animation.set({ x: "0%", y: "0%", opacity: 0, scaleX: 1, scaleY: 1 });
      return;
    }

    void animation.start({
      x: orientation === "horizontal" ? `${thumbIndex * 100}%` : "0%",
      y: orientation === "vertical" ? `${thumbIndex * 100}%` : "0%",
      opacity: 1,
      scaleX: orientation === "horizontal" && !reducedMotion ? [1, 1.18, 0.94, 1] : 1,
      scaleY: orientation === "vertical" && !reducedMotion ? [1, 1.18, 0.94, 1] : 1,
      transition: {
        x: reducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 520, damping: 24, mass: 0.55 },
        y: reducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 520, damping: 24, mass: 0.55 },
        opacity: { duration: 0.12 },
        scaleX: orientation !== "horizontal" || reducedMotion
          ? { duration: 0 }
          : { duration: 0.42, times: [0, 0.28, 0.7, 1], ease: [0.23, 1, 0.32, 1] },
        scaleY: orientation !== "vertical" || reducedMotion
          ? { duration: 0 }
          : { duration: 0.42, times: [0, 0.28, 0.7, 1], ease: [0.23, 1, 0.32, 1] },
      },
    });
  }, [animation, orientation, reducedMotion, selectedIndex, thumbIndex]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = Math.min(options.length - 1, Math.max(0, selectedIndex) + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = Math.max(0, Math.max(0, selectedIndex) - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const option = options[nextIndex];
    if (option.value === value) return;
    onChange(option.value);
    document.getElementById(`${id}-${option.value}`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-orientation={orientation}
      className="ui-rubber-segment"
      data-orientation={orientation}
      style={{ "--option-count": options.length } as React.CSSProperties}
      data-empty={selectedIndex < 0 ? "" : undefined}
    >
      <motion.span
        aria-hidden="true"
        className="ui-rubber-segment-thumb"
        initial={false}
        animate={animation}
        style={{ transformOrigin: "center" }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          id={`${id}-${option.value}`}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value || (value === null && selectedIndex < 0 && options[0] === option) ? 0 : -1}
          className="ui-rubber-segment-option"
          onClick={() => onChange(option.value)}
          onKeyDown={handleKeyDown}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
