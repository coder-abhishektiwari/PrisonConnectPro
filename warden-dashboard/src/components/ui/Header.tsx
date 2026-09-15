import { usePageHeaderConfig } from '@/context/PageHeaderContext';

export function Header() {
  const { title, subtitle, icon, actions } = usePageHeaderConfig();

  return (
    <header className="bg-white border-b border-neutral-200 h-16 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="w-9 h-9 rounded-lg bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-neutral-900 truncate">{title || 'Warden Panel'}</h2>
          {subtitle && <p className="text-xs text-neutral-500 truncate">{subtitle}</p>}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
