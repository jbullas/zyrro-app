import Link from 'next/link';

type SecondaryButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  href?: string; // renders a Link instead of a button when present
  compact?: boolean; // adds btn-secondary-compact
};

export default function SecondaryButton({ children, onClick, type = 'button', disabled, href, compact }: SecondaryButtonProps) {
  const className = `btn-secondary${compact ? ' btn-secondary-compact' : ''}${disabled ? ' btn-disabled' : ''}`;

  if (href) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
