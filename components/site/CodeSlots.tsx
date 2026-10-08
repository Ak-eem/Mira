'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ClipboardEvent, type ChangeEvent, type MouseEvent } from 'react'

export type CodeSlotsStatus = 'idle' | 'error' | 'success'

interface CodeSlotsProps {
  length?: number
  value?: string
  defaultValue?: string
  onChange?: (code: string) => void
  onComplete?: (code: string) => void | Promise<void>
  status?: CodeSlotsStatus
  mask?: boolean
  caret?: boolean
  disabled?: boolean
  autoFocus?: boolean
  accentColor?: string
  inkColor?: string
  slotColor?: string
  digitColor?: string
  dangerColor?: string
  slotSize?: number
  gap?: number
  radius?: number
  bounce?: number
  settle?: number
  rise?: number
  cascade?: number
  outcome?: 'accept' | 'reject'
  ariaLabel?: string
  className?: string
}

const digitsOnly = (raw: string, length: number) => raw.replace(/\D/g, '').slice(0, length)

export default function CodeSlots({
  length = 6,
  value,
  defaultValue = '',
  onChange,
  onComplete,
  status = 'idle',
  mask = false,
  caret = true,
  disabled = false,
  autoFocus = false,
  accentColor = '#f5f5f5',
  inkColor = '#f5f5f5',
  slotColor = '#27272a',
  digitColor = '#18181b',
  dangerColor = '#ff3b30',
  slotSize = 44,
  gap = 8,
  radius = 12,
  bounce = 0.2,
  settle = 0.3,
  rise = 8,
  cascade = 20,
  outcome = 'accept',
  ariaLabel = 'One-time code',
  className = '',
}: CodeSlotsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const countId = useId()
  const previousValue = useRef(value ?? defaultValue)
  const completedValue = useRef('')
  const [internalValue, setInternalValue] = useState(() => digitsOnly(defaultValue, length))
  const [focused, setFocused] = useState(false)
  const [cursorIndex, setCursorIndex] = useState(() => digitsOnly(value ?? defaultValue, length).length)
  const code = digitsOnly(value ?? internalValue, length)
  const activeIndex = Math.min(cursorIndex, length - 1)
  const filled = Array.from({ length }, (_, index) => code[index] ?? '')

  useEffect(() => {
    if (value === undefined) return
    const next = digitsOnly(value, length)
    if (next !== previousValue.current) {
      previousValue.current = next
      if (next.length < length) completedValue.current = ''
    }
  }, [value, length])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  function update(raw: string) {
    const next = digitsOnly(raw, length)
    previousValue.current = next
    if (value === undefined) setInternalValue(next)
    setCursorIndex(Math.min(inputRef.current?.selectionStart ?? next.length, length - 1))
    onChange?.(next)
    if (next.length < length) completedValue.current = ''
    if (next.length === length && completedValue.current !== next) {
      completedValue.current = next
      void onComplete?.(next)
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    update(event.target.value)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      inputRef.current?.blur()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    update(event.clipboardData.getData('text'))
  }

  function focusAtPointer(event: MouseEvent<HTMLDivElement>) {
    if (disabled) return
    const row = rowRef.current
    const input = inputRef.current
    if (!row || !input) return
    const rect = row.getBoundingClientRect()
    const pitch = row.offsetWidth / length
    const position = Math.floor((event.clientX - rect.left) / (rect.width / row.offsetWidth || 1) / pitch)
    const index = Math.max(0, Math.min(position, length - 1))
    setCursorIndex(index)
    input.focus()
    input.setSelectionRange(index, index)
  }

  const style = {
    '--cs-accent': accentColor,
    '--cs-ink': inkColor,
    '--cs-slot': slotColor,
    '--cs-digit': digitColor,
    '--cs-danger': dangerColor,
    '--cs-size': `min(${slotSize}px, calc((100vw - 100px - ${(length - 1) * gap}px) / ${length}))`,
    '--cs-gap': `${gap}px`,
    '--cs-radius': `${Math.min(radius, slotSize / 2)}px`,
    '--cs-font': `${Math.round(slotSize * 0.5)}px`,
    '--cs-rise': `${rise}px`,
    '--cs-settle': `${settle}s`,
    '--cs-bounce': bounce > 0 ? 'cubic-bezier(0.23, 1, 0.32, 1)' : 'ease-out',
    '--cs-cascade': `${cascade}ms`,
  } as CSSProperties

  return (
    <div className={`relative inline-block ${className}`} style={style}>
      <style>{`
        @keyframes code-slots-land {
          0% { opacity: 0; transform: translateY(var(--cs-rise)) scale(.72); }
          70% { opacity: 1; transform: translateY(-2px) scale(1.08); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes code-slots-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        @keyframes code-slots-blink {
          0%, 49.9% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .code-slots-motion { animation: none !important; transition: none !important; }
        }
      `}</style>
      <div
        ref={rowRef}
        onMouseDown={focusAtPointer}
        className={`relative inline-flex touch-manipulation gap-[var(--cs-gap)] ${status === 'error' ? 'code-slots-motion' : ''}`}
        style={status === 'error' ? { animation: 'code-slots-shake 220ms ease-in-out' } : undefined}
        data-status={status}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          value={code}
          maxLength={length}
          aria-label={ariaLabel}
          aria-invalid={status === 'error'}
          aria-describedby={countId}
          disabled={disabled || status === 'success'}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onSelect={(event) => setCursorIndex(Math.min(event.currentTarget.selectionStart ?? code.length, length - 1))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute inset-0 z-10 m-0 h-full w-full cursor-text opacity-0"
        />
        {filled.map((digit, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="relative grid w-[var(--cs-size)] place-items-center overflow-hidden select-none"
            style={{
              aspectRatio: `${slotSize} / ${Math.round(slotSize * 1.18)}`,
              borderRadius: 'var(--cs-radius)',
              backgroundColor: status === 'error'
                ? `color-mix(in srgb, ${dangerColor} 20%, ${slotColor})`
                : index === activeIndex && focused
                  ? `color-mix(in srgb, ${inkColor} 8%, ${slotColor})`
                  : slotColor,
            }}
          >
            {digit && (
              <span
                key={`${index}-${digit}`}
                className="code-slots-motion relative z-[1] grid h-full w-full place-items-center font-semibold tabular-nums"
                style={{
                  color: digitColor,
                  fontSize: 'var(--cs-font)',
                  backgroundColor: accentColor,
                  borderRadius: 'var(--cs-radius)',
                  animation: `code-slots-land var(--cs-settle) var(--cs-bounce) both`,
                  animationDelay: `${index * cascade}ms`,
                }}
              >
                {mask ? '•' : digit}
              </span>
            )}
            {focused && caret && index === activeIndex && !disabled && status === 'idle' && !digit && (
              <span
                className="pointer-events-none absolute top-1/4 z-[2] h-1/2 w-[1.5px]"
                style={{ left: '50%', transform: 'translateX(-50%)', backgroundColor: inkColor, animation: 'code-slots-blink 1s linear infinite' }}
              />
            )}
          </span>
        ))}
        {status === 'success' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[3] grid place-items-center"
            style={{
              borderRadius: 'var(--cs-radius)',
              backgroundColor: accentColor,
              color: digitColor,
            }}
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d={outcome === 'accept' ? 'm5 12.5 4.5 4.5L19 7.5' : 'm6 6 12 12M18 6 6 18'} />
            </svg>
          </span>
        )}
      </div>
      <span id={countId} className="sr-only" aria-live="polite">
        {status === 'success' ? 'Code accepted' : `${code.length} of ${length} digits entered`}
      </span>
    </div>
  )
}
