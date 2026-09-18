import { Outlet, Route, Routes } from 'react-router-dom';
import { SnackbarProvider } from '@training112/components/Snackbar';
import { ModalRoute } from './modals/ModalRoute';
import { ComponentCatalogPage } from './pages/ComponentCatalogPage';

function CatalogLayout() {
  return (
    <>
      <ComponentCatalogPage />
      <Outlet />
    </>
  );
}

export function App() {
  return (
    <SnackbarProvider>
      <Routes>
        <Route element={<CatalogLayout />} path="/">
          <Route element={<ModalRoute />} path="modal/form" />
        </Route>
      </Routes>
    </SnackbarProvider>
  );
}
