'use client';

import { useEffect } from 'react';
import { cancelTemporaryAdditionalServiceLineEdit } from '@/lib/additional-services-temporary-store';

export function useTemporaryAdditionalServiceEditCleanup() {
  useEffect(
    () => () => {
      cancelTemporaryAdditionalServiceLineEdit();
    },
    [],
  );
}
