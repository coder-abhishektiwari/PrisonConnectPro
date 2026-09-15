import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

interface PageHeaderConfig {
  title: string;
  subtitle?: string;
}

interface PageHeaderContextValue {
  config: PageHeaderConfig;
  setConfig: (config: PageHeaderConfig) => void;
  actionNode: ReactNode;
  setActionNode: (node: ReactNode) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  config: { title: '' },
  setConfig: () => {},
  actionNode: null,
  setActionNode: () => {},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<PageHeaderConfig>({ title: '' });
  const [actionNode, setActionNodeState] = useState<ReactNode>(null);
  const setConfig = useCallback((c: PageHeaderConfig) => setConfigState(c), []);
  const setActionNode = useCallback((n: ReactNode) => setActionNodeState(n), []);
  return (
    <PageHeaderContext.Provider value={{ config, setConfig, actionNode, setActionNode }}>
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

export function usePageHeaderAction() {
  const { setActionNode } = useContext(PageHeaderContext);
  return setActionNode;
}

export function usePageHeaderConfig() {
  const ctx = useContext(PageHeaderContext);
  return { title: ctx.config.title, subtitle: ctx.config.subtitle, action: ctx.actionNode };
}
