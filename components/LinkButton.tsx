import Link from 'next/link';

type LinkButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string; // renders a Link instead of a button when present
  disabled?: boolean;
  inline?: boolean; // adds btn-link-inline
};

export default function LinkButton({ children, onClick, href, disabled, inline }: LinkButtonProps) {
  const className = `btn-link${inline ? ' btn-link-inline' : ''}`;

  if (href) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
