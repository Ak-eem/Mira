'use client';

import React, { useEffect, useId, useRef, useState } from 'react';

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  displace?: number;
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: 'R' | 'G' | 'B';
  yChannel?: 'R' | 'G' | 'B';
  mixBlendMode?: React.CSSProperties['mixBlendMode'];
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Liquid-glass surface (SVG displacement + frosted fallback).
 * Changes from the original: light theme only (the site has no dark mode), the browser
 * checks run in an effect so server and client render the same markup, and phones /
 * reduced-motion users get the cheap CSS blur instead of the SVG filter, which is heavy.
 */
export default function GlassSurface({
  children,
  width = 200,
  height = 80,
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur = 11,
  displace = 0,
  backgroundOpacity = 0,
  saturation = 1,
  distortionScale = -180,
  redOffset = 0,
  greenOffset = 10,
  blueOffset = 20,
  xChannel = 'R',
  yChannel = 'G',
  mixBlendMode = 'difference',
  className = '',
  style = {},
}: GlassSurfaceProps) {
  const uid = useId().replace(/:/g, '-');
  const filterId = `glass-filter-${uid}`;
  const redGradId = `red-grad-${uid}`;
  const blueGradId = `blue-grad-${uid}`;

  const [svgOk, setSvgOk] = useState(false);
  const [backdropOk, setBackdropOk] = useState(false);

  const box = useRef<HTMLDivElement>(null);
  const feImage = useRef<SVGFEImageElement>(null);
  const redCh = useRef<SVGFEDisplacementMapElement>(null);
  const greenCh = useRef<SVGFEDisplacementMapElement>(null);
  const blueCh = useRef<SVGFEDisplacementMapElement>(null);
  const gBlur = useRef<SVGFEGaussianBlurElement>(null);

  const buildMap = () => {
    const r = box.current?.getBoundingClientRect();
    const w = r?.width || 400;
    const h = r?.height || 200;
    const edge = Math.min(w, h) * (borderWidth * 0.5);
    const svg = `
      <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect width="${w}" height="${h}" fill="black"/>
        <rect width="${w}" height="${h}" rx="${borderRadius}" fill="url(#${redGradId})"/>
        <rect width="${w}" height="${h}" rx="${borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode:${mixBlendMode}"/>
        <rect x="${edge}" y="${edge}" width="${w - edge * 2}" height="${h - edge * 2}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)"/>
      </svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };

  const updateMap = () => feImage.current?.setAttribute('href', buildMap());

  useEffect(() => {
    updateMap();
    [
      { ref: redCh, offset: redOffset },
      { ref: greenCh, offset: greenOffset },
      { ref: blueCh, offset: blueOffset },
    ].forEach(({ ref, offset }) => {
      ref.current?.setAttribute('scale', String(distortionScale + offset));
      ref.current?.setAttribute('xChannelSelector', xChannel);
      ref.current?.setAttribute('yChannelSelector', yChannel);
    });
    gBlur.current?.setAttribute('stdDeviation', String(displace));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, borderRadius, borderWidth, brightness, opacity, blur, displace, distortionScale, redOffset, greenOffset, blueOffset, xChannel, yChannel, mixBlendMode]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setBackdropOk(CSS.supports('backdrop-filter', 'blur(10px)'));
      const ua = navigator.userAgent;
      const webkitOnly = /Safari/.test(ua) && !/Chrome/.test(ua);
      const lite = window.matchMedia('(max-width: 767px), (prefers-reduced-motion: reduce)').matches;
      const probe = document.createElement('div');
      probe.style.backdropFilter = `url(#${filterId})`;
      setSvgOk(!webkitOnly && !/Firefox/.test(ua) && !lite && probe.style.backdropFilter !== '');
    });
    return () => cancelAnimationFrame(raf);
  }, [filterId]);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => setTimeout(updateMap, 0));
    ro.observe(box.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = {
    ...style,
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: `${borderRadius}px`,
  } as React.CSSProperties;

  let look: React.CSSProperties;
  if (svgOk) {
    look = {
      background: `hsl(0 0% 100% / ${backgroundOpacity})`,
      backdropFilter: `url(#${filterId}) saturate(${saturation})`,
      boxShadow: `0 0 2px 1px color-mix(in oklch, black, transparent 85%) inset,
        0 0 10px 4px color-mix(in oklch, black, transparent 90%) inset,
        0 8px 24px rgba(17, 17, 26, 0.05), 0 16px 56px rgba(17, 17, 26, 0.05)`,
    };
  } else if (backdropOk) {
    look = {
      background: 'rgba(255, 255, 255, 0.25)',
      backdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
      WebkitBackdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      boxShadow: `0 8px 32px 0 rgba(15, 42, 34, 0.14), inset 0 1px 0 0 rgba(255, 255, 255, 0.5),
        inset 0 -1px 0 0 rgba(255, 255, 255, 0.2)`,
    };
  } else {
    look = {
      background: 'rgba(255, 255, 255, 0.7)',
      border: '1px solid rgba(255, 255, 255, 0.5)',
    };
  }

  return (
    <div
      ref={box}
      className={`relative flex items-center justify-center overflow-hidden transition-opacity duration-[260ms] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF] ${className}`}
      style={{ ...base, ...look }}
    >
      <svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-0" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feImage ref={feImage} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
            <feDisplacementMap ref={redCh} in="SourceGraphic" in2="map" result="dispRed" />
            <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red" />
            <feDisplacementMap ref={greenCh} in="SourceGraphic" in2="map" result="dispGreen" />
            <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green" />
            <feDisplacementMap ref={blueCh} in="SourceGraphic" in2="map" result="dispBlue" />
            <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue" />
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="output" />
            <feGaussianBlur ref={gBlur} in="output" stdDeviation="0.7" />
          </filter>
        </defs>
      </svg>
      <div className="relative z-10 flex h-full w-full items-center justify-center rounded-[inherit] p-2">{children}</div>
    </div>
  );
}
