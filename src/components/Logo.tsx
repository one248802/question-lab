/** 질문 상자 그림 */
export function QuestionBoxIcon({ className = 'size-24' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <rect x="14" y="44" width="92" height="64" rx="18" fill="#ffd966" stroke="#c9a640" strokeWidth="4" />
      <path d="M14 66h92" stroke="#c9a640" strokeWidth="4" />
      <rect x="44" y="56" width="32" height="7" rx="3.5" fill="#34334a" opacity="0.75" />
      <circle cx="60" cy="88" r="10" fill="#fff" stroke="#c9a640" strokeWidth="3" />
      <text x="60" y="93.5" textAnchor="middle" fontSize="16" fontWeight="800" fill="#34334a" fontFamily="sans-serif">
        ?
      </text>
      <g transform="rotate(-12 44 26)">
        <rect x="28" y="10" width="32" height="34" rx="8" fill="#ffb3cc" stroke="#e08aa8" strokeWidth="3" />
        <text x="44" y="35" textAnchor="middle" fontSize="20" fontWeight="800" fill="#34334a" fontFamily="sans-serif">
          ?
        </text>
      </g>
      <g transform="rotate(10 78 22)">
        <rect x="64" y="6" width="30" height="32" rx="8" fill="#9fcdfb" stroke="#78ade2" strokeWidth="3" />
        <text x="79" y="29" textAnchor="middle" fontSize="18" fontWeight="800" fill="#34334a" fontFamily="sans-serif">
          ?
        </text>
      </g>
    </svg>
  )
}
