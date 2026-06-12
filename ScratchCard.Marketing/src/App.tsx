import { Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LegalPage from "./pages/LegalPage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacy" element={<LegalPage page="privacy" />} />
      <Route path="/terms" element={<LegalPage page="terms" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
