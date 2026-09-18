import { useContext } from 'react';
import { SnackbarContext } from './SnackbarContext';

export function useSnackbar() {
  const snackbar = useContext(SnackbarContext);

  if (snackbar === null) {
    throw new Error('useSnackbar must be used within SnackbarProvider');
  }

  return snackbar;
}
