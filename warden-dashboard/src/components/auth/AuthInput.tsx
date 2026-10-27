import { useState, type InputHTMLAttributes } from 'react';

interface AuthInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'className'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  icon?: React.ReactNode;
}

/**
 * Floating-label input with focus states, inline errors, and password visibility toggle.
 */
export function AuthInput({
  label,
  value,
  onChange,
  error,
  icon,
  type = 'text',
  id,
  ...rest
}: AuthInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && showPassword ? 'text' : type;
  const inputId = id ?? `auth-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const hasValue = value.length > 0;

  return (
    <div className="w-full">
      <div className="relative">
        {/* Leading Icon */}
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none z-10">
            {icon}
          </span>
        )}

        {/* Input */}
        <input
          id={inputId}
          type={resolvedType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=" "
          className={`
            w-full rounded-2xl border bg-canvas px-4 pt-5 pb-2 text-15 text-neutral-900
            transition-all duration-200 outline-none
            peer
            ${icon ? 'pl-11' : ''}
            ${isPassword ? 'pr-12' : ''}
            ${error
              ? 'border-error-300 focus:border-error-500 focus:bg-white focus:ring-4 focus:ring-error-500/10'
              : 'border-line focus:border-neutral-500 focus:bg-white focus:ring-4 focus:ring-black/[0.04] hover:border-neutral-400'
            }
          `}
          {...rest}
        />

        {/* Floating Label */}
        <label
          htmlFor={inputId}
          className={`
            absolute transition-all duration-200 pointer-events-none
            ${icon ? 'left-11' : 'left-4'}
            ${hasValue
              ? 'top-1.5 text-11 font-medium text-neutral-500 tracking-wide'
              : 'top-1/2 -translate-y-1/2 text-neutral-400 text-15'
            }
            peer-focus:top-1.5 peer-focus:text-11 peer-focus:font-medium peer-focus:text-neutral-500 peer-focus:tracking-wide
            peer-focus:-translate-y-0
            ${error && !hasValue ? 'peer-focus:text-error-500' : ''}
          `}
        >
          {label}
        </label>

        {/* Password Toggle */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 transition-colors focus:outline-none"
          >

            {showPassword ? (
              <span className="material-icons text-[20px]" aria-hidden="true">
                visibility_off
              </span>
            ) : (
              <span className="material-icons text-[20px]" aria-hidden="true">
                visibility
              </span>
            )}

          </button>
        )}

        {/* Error Icon */}
        {error && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-error-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
        )}
      </div>

      {/* Inline Error Message */}
      {error && (
        <p className="mt-1.5 text-sm text-error-600 flex items-center gap-1.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}