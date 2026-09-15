import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface PageHeaderConfig {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

interface PageHeaderContextValue {
  config: PageHeaderConfig;
  setConfig: (config: PageHeaderConfig) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  config: { title: '' },
  setConfig: () => {},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<PageHeaderConfig>({ title: '' });
  const setConfig = useCallback((c: PageHeaderConfig) => setConfigState(c), []);
  return (
    <PageHeaderContext.Provider value={{ config, setConfig }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader(config: PageHeaderConfig) {
  const { setConfig } = useContext(PageHeaderContext);
  // Set on every render so changes propagate
  setConfig(config);
}

export function usePageHeaderConfig() {
  return useContext(PageHeaderContext).config;
}
