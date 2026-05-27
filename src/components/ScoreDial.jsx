import { useEffect } from 'react'

// Eight positions around the cell. 12 o'clock = par; better-than-par on the
// left, worse on the right, mirroring how scorecards are read. Order here
// matches angle ascending so a pointer's angle can be mapped to a chip by
// index (`Math.round(angle/45) % 8`).
export const DIAL_ITEMS = [
  { key: 'par',    diff: 0,    label: 'par',     angle:   0, color: 'var(--tt-score-par)' },
  { key: 'bogey',  diff: 1,    label: 'bogey',   angle:  45, color: 'var(--tt-score-bogey)' },
  { key: 'double', diff: 2,    label: 'double',  angle:  90, color: 'var(--tt-score-double)' },
  { key: 'triple', diff: 3,    label: 'triple',  angle: 135, color: 'var(--tt-score-double)' },
  { key: 'type',   diff: null, label: 'type',    angle: 180, color: 'var(--tt-ink-soft)' },
  { key: 'clear',  diff: null, label: 'clear',   angle: 225, color: 'var(--tt-ink-soft)' },
  { key: 'eagle',  diff: -2,   label: 'eagle',   angle: 270, color: 'var(--tt-score-eagle)' },
  { key: 'birdie', diff: -1,   label: 'birdie',  angle: 315, color: 'var(--tt-score-birdie)' },
]

export const DIAL_KEY_BY_ANGLE_IDX = DIAL_ITEMS.map(i => i.key)

const RADIUS = 78
const CHIP = 54
const CHIP_ARMED = 68

export function grossForDialKey(key, par, strokesOnHole) {
  const item = DIAL_ITEMS.find(i => i.key === key)
  if (!item || item.diff == null) return null
  return par + strokesOnHole + item.diff
}

export default function ScoreDial({
  anchorRect, par, strokesOnHole = 0, armedKey = null,
  onPick, onClear, onType, onClose,
}) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!anchorRect) return null

  // Anchor at the cell, but pull toward viewport center so the ring never
  // gets clipped at the edge of the screen.
  const margin = RADIUS + CHIP_ARMED / 2 + 8
  const cx = clamp(anchorRect.left + anchorRect.width / 2, margin, window.innerWidth - margin)
  const cy = clamp(anchorRect.top + anchorRect.height / 2, margin, window.innerHeight - margin)

  const netPar = par + strokesOnHole

  return (
    <div
      onPointerDown={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15, 20, 12, 0.28)',
        touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <div style={{ position: 'absolute', left: cx, top: cy, pointerEvents: 'none' }}>
        {DIAL_ITEMS.map(item => {
          const rad = (item.angle - 90) * Math.PI / 180
          const dx = Math.cos(rad) * RADIUS
          const dy = Math.sin(rad) * RADIUS
          const gross = item.diff == null ? null : netPar + item.diff
          const outOfRange = gross != null && (gross < 1 || gross > 20)
          const isSpecial = item.key === 'type' || item.key === 'clear'
          const armed = armedKey === item.key
          const display = item.key === 'type' ? '⌨' : item.key === 'clear' ? '✕' : gross
          const size = armed ? CHIP_ARMED : CHIP
          return (
            <button
              key={item.key}
              type="button"
              disabled={outOfRange}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                if (item.key === 'type') onType()
                else if (item.key === 'clear') onClear()
                else onPick(gross)
              }}
              style={{
                position: 'absolute',
                left: dx, top: dy,
                transform: 'translate(-50%, -50%)',
                width: size, height: size,
                borderRadius: '50%',
                border: `1px solid ${armed ? item.color : 'var(--tt-line)'}`,
                background: armed ? 'var(--tt-paper)' : 'var(--tt-paper)',
                color: item.color,
                fontFamily: 'var(--tt-font-mono)',
                fontWeight: 700,
                fontSize: armed ? (isSpecial ? 24 : 28) : (isSpecial ? 20 : 22),
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                boxShadow: armed
                  ? `0 10px 26px rgba(0,0,0,0.32), 0 0 0 4px ${item.color}33`
                  : '0 6px 18px rgba(0,0,0,0.22)',
                pointerEvents: outOfRange ? 'none' : 'auto',
                opacity: outOfRange ? 0.25 : 1,
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
                transition: 'width 90ms ease, height 90ms ease, font-size 90ms ease, box-shadow 90ms ease',
              }}
            >
              <span style={{ lineHeight: 1 }}>{display}</span>
              <span style={{
                fontSize: armed ? 10 : 8,
                fontFamily: 'var(--tt-font-ui)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                opacity: 0.75,
                marginTop: 3,
                color: 'var(--tt-ink-soft)',
              }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}
