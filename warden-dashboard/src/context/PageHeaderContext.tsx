import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

interface PageHeaderConfig {
  title: string;
  subtitle?: string;
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
  const prev = useRef({ title: config.title, subtitle: config.subtitle });
  if (prev.current.title !== config.title || prev.current.subtitle !== config.subtitle) {
    prev.current = { title: config.title, subtitle: config.subtitle };
    setConfig(config);
  }
}

export function usePageHeaderConfig() {
  return useContext(PageHeaderContext).config;
}
