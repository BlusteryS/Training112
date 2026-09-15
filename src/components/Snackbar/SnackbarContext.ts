import { createContext } from 'react';
import type { SnackbarProps } from './Snackbar';

export type SnackbarOptions = SnackbarProps & {
  duration?: number;
};

export type SnackbarHandle = {
  close: () => void;
  id: string;
};

export type SnackbarApi = {
  close: () => void;
  open: (options: SnackbarOptions) => SnackbarHandle;
};

export const SnackbarContext = createContext<SnackbarApi | null>(null);
