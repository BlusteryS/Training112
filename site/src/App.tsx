import { useState } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import { SnackbarProvider } from '@training112/components/Snackbar';
import { ModalRoute } from './modals/ModalRoute';
import { ComponentCatalogPage } from './pages/ComponentCatalogPage';
import { LoginPage } from './pages/LoginPage';

const AUTH_STORAGE_KEY = 'training112-authenticated';

function getStoredAuthentication() {
  try {
    return window.sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function CatalogLayout() {
  return (
    <>
      <ComponentCatalogPage />
      <Outlet />
    </>
  );
}

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(getStoredAuthentication);

  const handleLogin = () => {
    try {
      window.sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
    } catch {
      // The login still works until the page is reloaded.
    }

    setIsAuthenticated(true);
  };

  return (
    <SnackbarProvider>
      {isAuthenticated ? (
        <Routes>
          <Route element={<CatalogLayout />} path="/">
            <Route element={<ModalRoute />} path="modal/form" />
          </Route>
        </Routes>
      ) : (
        <LoginPage onLogin={handleLogin} />
      )}
    </SnackbarProvider>
  );
}
