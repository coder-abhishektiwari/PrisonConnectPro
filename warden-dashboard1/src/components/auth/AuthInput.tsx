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
            w-full rounded-xl border-2 bg-white px-4 pt-5 pb-2 text-neutral-900
            transition-all duration-200 outline-none
            peer
            ${icon ? 'pl-11' : ''}
            ${isPassword ? 'pr-12' : ''}
            ${
              error
                ? 'border-error-300 focus:border-error-500 focus:ring-4 focus:ring-error-500/10'
                : 'border-neutral-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 hover:border-neutral-300'
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
            ${
              hasValue
                ? 'top-1.5 text-[11px] font-semibold text-primary-600 uppercase tracking-wider'
                : 'top-1/2 -translate-y-1/2 text-neutral-500 text-sm'
            }
            peer-focus:top-1.5 peer-focus:text-[11px] peer-focus:font-semibold peer-focus:text-primary-600 peer-focus:uppercase peer-focus:tracking-wider
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
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors focus:outline-none"
          >
            {showPassword ? (
              /* Eye Off Icon */
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
              </svg>
            ) : (
              /* Eye Icon */
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
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