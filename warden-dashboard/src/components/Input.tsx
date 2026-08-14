interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'password';
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  error,
  disabled = false,
  className = '',
}: InputProps) {
  return (
    <div className={`w-full ${className}`}>
      <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-4 py-2.5 rounded-lg border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed ${error ? 'border-error bg-error-50' : 'border-neutral-300 bg-white hover:border-neutral-400'}`}
      />
      {error && <p className="mt-1 text-sm text-error">{error}</p>}
    </div>
  );
}
