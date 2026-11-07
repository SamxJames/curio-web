/** A small bone, drawn in the current text colour: the mark for "you found the fossil". Decorative. */
export default function BoneMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`${className} shrink-0`} fill="currentColor" aria-hidden="true">
      <path d="M6.5 13.5 13.5 6.5" stroke="currentColor" strokeWidth={3} strokeLinecap="round" fill="none" />
      <circle cx={4.5} cy={12.5} r={2.2} />
      <circle cx={7.5} cy={15.5} r={2.2} />
      <circle cx={12.5} cy={4.5} r={2.2} />
      <circle cx={15.5} cy={7.5} r={2.2} />
    </svg>
  );
}
