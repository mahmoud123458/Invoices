interface LoadingSpinnerProps {
  variant?: 'fullpage' | 'inline';
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<string, string> = {
  sm: 'size-4 border-2',
  md: 'size-7 border-2',
  lg: 'size-10 border-[3px]',
};

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-blue-600 border-t-transparent ${sizeClasses[size]}`}
    />
  );
}

export default function LoadingSpinner({ variant = 'inline', size = 'md' }: LoadingSpinnerProps) {
  if (variant === 'fullpage') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <Spinner size={size ?? 'lg'} />
      </div>
    );
  }

  return <Spinner size={size} />;
}
