import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'mint' | 'sky' | 'pink'
type Size = 'md' | 'lg' | 'xl' | 'sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-butter text-ink border-[#e8c34f]',
  secondary: 'bg-paper text-ink border-line-strong',
  ghost: 'bg-transparent text-ink border-transparent shadow-none hover:bg-ink/5',
  danger: 'bg-pink-soft text-pink-ink border-pink',
  mint: 'bg-mint text-ink border-[#6fc9a4]',
  sky: 'bg-sky text-ink border-[#7fb6ec]',
  pink: 'bg-pink text-ink border-[#f095b4]',
}

const SIZES: Record<Size, string> = {
  sm: 'min-h-10 px-3 text-base rounded-xl gap-1.5',
  md: 'min-h-12 px-5 text-lg rounded-2xl gap-2',
  lg: 'min-h-14 px-6 text-xl rounded-2xl gap-2',
  xl: 'min-h-20 px-8 text-2xl rounded-3xl gap-3',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  style,
  ...rest
}: ButtonProps) {
  const stableVisual = style?.transform === 'none'

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center border-2 font-bold select-none transition',
        variant !== 'ghost' && !stableVisual && 'shadow-pop-sm hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0.5 active:shadow-none',
        'disabled:opacity-50 disabled:hover:translate-y-0',
        variant !== 'ghost' && !stableVisual && 'disabled:hover:shadow-pop-sm',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      style={stableVisual ? { ...style, transform: 'none', boxShadow: 'none' } : style}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-3xl border-2 border-line bg-paper p-5 shadow-pop sm:p-6', className)}>{children}</div>
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-lg font-bold">
      {children}
    </label>
  )
}

const FIELD =
  'w-full rounded-2xl border-2 border-line-strong bg-paper px-4 text-lg text-ink placeholder:text-ink-soft/60 focus:border-sky focus:outline-none'

function arbitraryWidth(className?: string) {
  const match = className?.match(/(?:^|\s)w-\[([0-9.]+(?:rem|px|em|%|vw|ch))\](?:\s|$)/)
  return match?.[1]
}

export function Input({ className, style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const fixedWidth = arbitraryWidth(className)
  return (
    <input
      className={cx(FIELD, 'min-h-14', className)}
      style={fixedWidth ? { width: fixedWidth, ...style } : style}
      {...rest}
    />
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(FIELD, 'min-h-32 resize-y py-3 leading-relaxed', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(FIELD, 'min-h-14 appearance-auto', className)} {...rest}>
      {children}
    </select>
  )
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap', className)}>
      {children}
    </span>
  )
}

export function Spinner({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-lg text-ink-soft" role="status">
      <LoaderCircle className="size-7 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 rounded-2xl border-2 border-pink bg-pink-soft px-4 py-3 text-lg font-bold text-pink-ink" role="alert">
      <TriangleAlert className="mt-0.5 size-6 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line-strong bg-paper/60 px-6 py-12 text-center">
      <div className="text-ink-soft">{icon}</div>
      <p className="text-xl font-bold">{title}</p>
      {children}
    </div>
  )
}

/** ON/OFF 스위치 */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-10 w-20 shrink-0 items-center rounded-full border-2 transition disabled:opacity-50',
        checked ? 'border-[#6fc9a4] bg-mint' : 'border-line-strong bg-line',
      )}
    >
      <span
        className={cx(
          'absolute left-1 inline-flex size-7 items-center justify-center rounded-full bg-paper text-xs font-extrabold shadow-pop-sm transition-transform',
          checked ? 'translate-x-10 text-mint-ink' : 'translate-x-0 text-ink-soft',
        )}
      >
        {checked ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

/** 고르기 버튼 묶음 (질문 유형 선택, 필터 등) */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  colorOf,
  size = 'md',
}: {
  options: Array<{ value: T; label: string }>
  value: T | null
  onChange: (v: T) => void
  colorOf?: (v: T) => string
  size?: 'md' | 'sm'
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-2xl border-2 font-bold transition',
              size === 'md' ? 'min-h-12 px-4 text-lg' : 'min-h-10 px-3 text-base',
              active
                ? cx('border-ink/40 shadow-pop-sm', colorOf ? colorOf(o.value) : 'bg-butter')
                : 'border-line bg-paper text-ink-soft hover:border-line-strong',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function PageTitle({ icon, title, right }: { icon?: ReactNode; title: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-3 font-display text-3xl sm:text-4xl">
        {icon}
        {title}
      </h1>
      {right}
    </div>
  )
}
