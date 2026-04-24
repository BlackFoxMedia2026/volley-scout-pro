interface Props {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export function PlaynexLogo({ size = 'md', showTagline = false }: Props) {
  const h = size === 'sm' ? 20 : size === 'lg' ? 36 : 26;

  return (
    <div className="playnex-logo">
      <svg
        className="playnex-logo__icon"
        height={h}
        viewBox="0 0 38 30"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Vertical stem */}
        <rect x="0" y="0" width="7" height="30" rx="1.5" fill="#FFD600" />
        {/* Back chevron — semi-transparent */}
        <path d="M8 0 L8 30 L20 15 Z" fill="#FFD600" opacity="0.38" />
        {/* Front chevron */}
        <path d="M17 0 L17 30 L32 15 Z" fill="#FFD600" />
        {/* Inner cut to give depth */}
        <path d="M17 30 L20 15 L17 0 Z" fill="#08080A" opacity="0.5" />
      </svg>

      <div className="playnex-logo__wordmark">
        <span className="playnex-logo__name">
          <span>PLAY</span><span>NEX</span>
        </span>
        {showTagline && (
          <span className="playnex-logo__tag">The next level of sports performance</span>
        )}
      </div>
    </div>
  );
}
