import { type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Primary CTA button with animated loading spinner.
 * Prevents double-submission while loading.
 */
export function LoadingButton({
  children,
  isLoading = false,
  loadingText,
  variant = 'primary',
  size = 'md',
  disabled,
  className = '',
  ...rest
}: LoadingButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] select-none';

  const variants = {
    primary:
      'bg-primary-600 text-white hover:bg-primary-500 focus:ring-primary-500/20 shadow-lg shadow-primary-600/20',
    secondary:
      'bg-slate-800 text-white hover:bg-slate-700 focus:ring-slate-500/20',
    outline:
      'border-2 border-primary-500 text-primary-400 hover:bg-primary-500/10 focus:ring-primary-500/20',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  };

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {loadingText ?? 'Please wait...'}
        </>
      ) : (
        children
      )}
    </button>
  );
}