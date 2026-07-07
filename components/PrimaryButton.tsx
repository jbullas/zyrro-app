import Link from 'next/link';

type PrimaryButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  href?: string; // renders a Link instead of a button when present
};

export default function PrimaryButton({ children, onClick, type = 'button', disabled, href }: PrimaryButtonProps) {
  const className = `btn-primary${disabled ? ' btn-disabled' : ''}`;

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
