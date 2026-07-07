import { IconArrowLeft } from '@tabler/icons-react';

type BackButtonProps = {
  onClick: () => void;
  label?: string;
};

export default function BackButton({ onClick, label = 'Back' }: BackButtonProps) {
  return (
    <button onClick={onClick} className="btn-back">
      <IconArrowLeft size={16} stroke={2} />
      {label}
    </button>
  );
}
