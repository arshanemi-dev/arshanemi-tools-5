'use client';

import { useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '@/store';

// Creates the Redux store once (client only) and provides it. Sheet-parsing
// settings live here and are mirrored to localStorage by makeStore().
export default function StoreProvider({ children }) {
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = makeStore();
  return <Provider store={storeRef.current}>{children}</Provider>;
}
