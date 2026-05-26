// Tee Trip — shared UI primitives.
// Ported from the design system handoff (ui_kits/app/components.jsx).
// All styling reads from CSS tokens in src/index.css.

export function Shell({ children, style }) {
  return <div className="shell" style={style}>{children}</div>
}

export function BackLink({ onClick, children = 'Back' }) {
  if (!onClick) return null
  return (
    <a
      href="#"
      onClick={e => { e.preventDefault(); onClick() }}
      className="tt-small tt-muted"
      style={{ display: 'inline-block', marginBottom: 6 }}
    >← {children}</a>
  )
}

export function Header({ title, eyebrow, meta, right }) {
  return (
    <header style={{ marginBottom: 16 }}>
      {eyebrow && <div className="tt-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: 'var(--tt-text-2xl)', margin: 0 }}>{title}</h1>
        {right}
      </div>
      {meta && <p className="tt-small tt-muted" style={{ margin: '4px 0 0' }}>{meta}</p>}
    </header>
  )
}

const BUTTON_VARIANTS = {
  primary: { background: 'var(--tt-fairway)', color: '#fff', border: '1px solid var(--tt-fairway)' },
  ghost:   { background: 'transparent', color: 'var(--tt-ink)', border: '1px solid var(--tt-line)' },
  google:  { background: '#fff', color: '#1a1a1a', border: '1px solid var(--tt-line)' },
  apple:   { background: '#000', color: '#fff', border: '1px solid #000' },
  danger:  { background: 'var(--tt-pencil)', color: '#fff', border: '1px solid var(--tt-pencil)' },
}

export function Button({ variant = 'primary', size, children, style, ...rest }) {
  const variantStyle = BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.primary
  const padding = size === 'sm' ? '.45em 1em' : '.7em 1.2em'
  const fontSize = size === 'sm' ? 13 : 14
  return (
    <button
      {...rest}
      style={{
        ...variantStyle,
        padding,
        borderRadius: 'var(--tt-radius)',
        fontWeight: 600,
        fontFamily: 'inherit',
        fontSize,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '.5em',
        transition: 'background 150ms linear',
        ...style,
      }}
    >{children}</button>
  )
}

export function Card({ children, padded = true, style, className = '', ...rest }) {
  return (
    <div
      {...rest}
      className={`ttkit-card ${className}`.trim()}
      style={{
        background: 'var(--tt-paper)',
        border: '1px solid var(--tt-line)',
        borderRadius: 'var(--tt-radius-md)',
        padding: padded ? '1.125rem' : 0,
        boxShadow: 'var(--tt-shadow)',
        position: 'relative',
        ...style,
      }}
    >{children}</div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block' }}>
      {label && <div className="tt-eyebrow" style={{ marginBottom: 6 }}>{label}</div>}
      {children}
      {hint && <p className="tt-xs tt-muted" style={{ margin: '6px 0 0' }}>{hint}</p>}
    </label>
  )
}

// Pass-through wrappers so the rest of the codebase can stop sprinkling inline styles.
export function Input(props) {
  return (
    <input
      {...props}
      style={{
        fontFamily: 'inherit',
        fontSize: 14,
        padding: '.55em .75em',
        border: '1px solid var(--tt-line)',
        borderRadius: 8,
        background: 'var(--tt-paper)',
        color: 'var(--tt-ink)',
        width: '100%',
        outline: 'none',
        ...(props.style || {}),
      }}
    />
  )
}

export function Select(props) {
  return (
    <select
      {...props}
      style={{
        fontFamily: 'inherit',
        fontSize: 14,
        padding: '.55em .75em',
        border: '1px solid var(--tt-line)',
        borderRadius: 8,
        background: 'var(--tt-paper)',
        color: 'var(--tt-ink)',
        width: '100%',
        outline: 'none',
        ...(props.style || {}),
      }}
    >{props.children}</select>
  )
}

export function Tabs({ value, onChange, items, style }) {
  return (
    <nav style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 16, ...style }}>
      {items.map(it => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            style={{
              padding: '.4rem .8rem',
              borderRadius: 8,
              background: active ? 'var(--tt-fairway)' : 'transparent',
              color: active ? '#fff' : 'var(--tt-ink-soft)',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 150ms linear, color 150ms linear',
            }}
          >{it.label}</button>
        )
      })}
    </nav>
  )
}

const CHIP_TONES = {
  default: { background: 'var(--tt-paper)',         color: 'var(--tt-ink-soft)',     border: '1px solid var(--tt-line)' },
  format:  { background: 'var(--tt-fairway-tint)',  color: 'var(--tt-fairway-deep)', border: '1px solid transparent' },
  gold:    { background: 'rgba(196,154,58,.15)',    color: '#8a6a1e',                border: '1px solid rgba(196,154,58,.4)' },
  sky:     { background: 'rgba(138,182,198,.20)',   color: '#3d6f80',                border: '1px solid rgba(138,182,198,.4)' },
  danger:  { background: 'rgba(185,74,58,.10)',     color: 'var(--tt-pencil)',       border: '1px solid rgba(185,74,58,.25)' },
}

export function Chip({ tone = 'default', live, children, style }) {
  const tones = CHIP_TONES[tone] ?? CHIP_TONES.default
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      ...tones,
      ...style,
    }}>
      {live && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />}
      {children}
    </span>
  )
}

export function PlayerAvatar({ emoji, name, size = 40, me, withName }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--tt-paper)',
          border: '1px solid ' + (me ? 'var(--tt-fairway)' : 'var(--tt-line)'),
          boxShadow: me ? '0 0 0 2px var(--tt-fairway-tint)' : 'var(--tt-shadow-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(14, Math.round(size * 0.5)),
        }}
      >{emoji}</div>
      {withName && <div className="tt-xs tt-soft">{name}</div>}
    </div>
  )
}

// Pencil-circle SVG filters — included once at the top of any page that uses
// circled scorecard cells. Referenced via filter: url(#tt-pencil-1).
export function PencilFilters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="tt-pencil-1" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" />
        </filter>
        <filter id="tt-pencil-2" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.0" />
        </filter>
      </defs>
    </svg>
  )
}
