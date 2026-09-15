import { Outlet, Route, Routes } from 'react-router-dom';
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
    <Routes>
      <Route element={<CatalogLayout />} path="/">
        <Route element={<ModalRoute />} path="modal/form" />
      </Route>
    </Routes>
  );
}
