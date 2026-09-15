import { createContext, useContext, useState, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';

interface PageHeaderConfig {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
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
  const configRef = useRef(config);
  configRef.current = config;

  useLayoutEffect(() => {
    setConfig(configRef.current);
  }, [config.title, config.subtitle, setConfig]);
}

export function usePageHeaderConfig() {
  return useContext(PageHeaderContext).config;
}
