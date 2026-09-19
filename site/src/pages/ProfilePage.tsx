import { useState } from 'react';
import { Button, useSnackbar } from '@training112/components';
import { useAuth } from '../auth/AuthContext';
import { SectionPage } from '../layout/SectionPage';

export function ProfilePage() {
  const { logout } = useAuth();
  const snackbar = useSnackbar();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      snackbar.open({
        title: 'Не удалось выйти',
        subtitle: error instanceof Error ? error.message : 'Попробуйте ещё раз.',
      });
      setIsLoggingOut(false);
    }
  };

  return (
    <SectionPage
      actions={<Button disabled={isLoggingOut} mode="outline" onClick={handleLogout}>Выйти</Button>}
      title="Профиль"
    />
  );
}
