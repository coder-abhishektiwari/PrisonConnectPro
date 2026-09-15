import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';

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

// Action slot: ref-based, no infinite loops
let globalActionRef: ReactNode = null;
let globalActionListeners: Set<() => void> = new Set();

function notifyActionListeners() {
  globalActionListeners.forEach((l) => l());
}

export function setPageAction(action: ReactNode) {
  globalActionRef = action;
  notifyActionListeners();
}

export function usePageAction() {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    globalActionListeners.add(listener);
    return () => { globalActionListeners.delete(listener); };
  }, []);
  return globalActionRef;
}

export function usePageHeaderConfig() {
  const ctx = useContext(PageHeaderContext);
  return { title: ctx.config.title, subtitle: ctx.config.subtitle };
}
