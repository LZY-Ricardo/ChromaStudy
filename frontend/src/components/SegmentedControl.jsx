import { useMemo } from 'react'

function SegmentedControl({ options, value, onChange, className = '', ariaLabel = 'Segmented control' }) {
  const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options])

  const activeIndex = useMemo(() => {
    const idx = safeOptions.findIndex((option) => option.value === value)
    return idx >= 0 ? idx : 0
  }, [safeOptions, value])

  if (safeOptions.length === 0) return null

  const count = Math.max(1, safeOptions.length)
  const thumbStyle = {
    width: `calc((100% - 8px) / ${count})`,
    transform: `translateX(${activeIndex * 100}%)`,
  }
  const gridStyle = { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative w-full rounded-full bg-slate-100 p-1 shadow-inner ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-out"
        style={thumbStyle}
      />

      <div className="grid" style={gridStyle}>
        {safeOptions.map((option, index) => {
          const selected = index === activeIndex
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`relative z-10 flex items-center justify-center rounded-full px-3 py-2 text-[13px] font-semibold transition-colors ${
                selected ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => onChange?.(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default SegmentedControl
