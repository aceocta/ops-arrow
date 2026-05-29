import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { CustomersListPage } from "./pages/CustomersListPage";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { ShopsListPage } from "./pages/ShopsListPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/customers"
        element={
          <RequireAuth>
            <Layout>
              <CustomersListPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/customers/:id"
        element={
          <RequireAuth>
            <Layout>
              <CustomerDetailPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/shops"
        element={
          <RequireAuth>
            <Layout>
              <ShopsListPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/customers" replace />} />
    </Routes>
  );
}
