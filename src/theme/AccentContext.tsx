import React, { createContext, useContext, useMemo, useState } from 'react';

import { AccentColor } from '../types/girvi';
import { AccentTheme, getAccent } from './index';

interface AccentContextValue {
  accent: AccentTheme;
  accentId: AccentColor;
  setAccentId: (id: AccentColor) => void;
}

const AccentContext = createContext<AccentContextValue>({
  accent: getAccent('gold'),
  accentId: 'gold',
  setAccentId: () => {},
});

export const AccentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accentId, setAccentId] = useState<AccentColor>('gold');

  const value = useMemo(
    () => ({ accent: getAccent(accentId), accentId, setAccentId }),
    [accentId]
  );

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
};

export function useAccent(): AccentContextValue {
  return useContext(AccentContext);
}
