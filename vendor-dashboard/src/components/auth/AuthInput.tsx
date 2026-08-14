import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

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
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none z-10">
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
            w-full rounded-xl border-2 bg-slate-800/50 px-4 pt-5 pb-2 text-white
            transition-all duration-200 outline-none
            peer
            ${icon ? 'pl-11' : ''}
            ${isPassword ? 'pr-12' : ''}
            ${
              error
                ? 'border-red-500/50 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                : 'border-slate-700 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 hover:border-slate-600'
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
                ? 'top-1.5 text-[11px] font-semibold text-primary-400 uppercase tracking-wider'
                : 'top-1/2 -translate-y-1/2 text-slate-500 text-sm'
            }
            peer-focus:top-1.5 peer-focus:text-[11px] peer-focus:font-semibold peer-focus:text-primary-400 peer-focus:uppercase peer-focus:tracking-wider
            peer-focus:-translate-y-0
            ${error && !hasValue ? 'peer-focus:text-red-400' : ''}
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
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        )}

        {/* Error Icon */}
        {error && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-red-500">
            <AlertCircle className="w-5 h-5" />
          </span>
        )}
      </div>

      {/* Inline Error Message */}
      {error && (
        <p className="mt-1.5 text-sm text-red-400 flex items-center gap-1.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}