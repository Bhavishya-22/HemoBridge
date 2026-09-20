
import "../index.css";
import { Routes, Route, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import DonateBloodPage from "./pages/DonateBloodPage";
import RequestBloodPage from "./pages/RequestBloodPage";
import FAQPage from "./pages/FAQPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import AdminDashboard from "./pages/AdminDashboard";
import HospitalDashboard from "./pages/HospitalDashboard";
import RoleRoute, { RequireAuth } from "../components/RoleRoute";

// Routes where the global Navbar should be hidden (they have their own sidebar)
const DASHBOARD_PATHS = ["/admin", "/hospital"];

export default function App() {
  const location = useLocation();
  const isDashboard = DASHBOARD_PATHS.some((p) => location.pathname.startsWith(p));

  return (
    <>
      {!isDashboard && <Navbar />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route
          path="/request"
          element={
            <RoleRoute allowedRoles={["receiver"]}>
              <RequestBloodPage />
            </RoleRoute>
          }
        />
        <Route
          path="/donate"
          element={
            <RoleRoute allowedRoles={["donor"]}>
              <DonateBloodPage />
            </RoleRoute>
          }
        />
        <Route path="/faq" element={<FAQPage />} />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route
          path="/admin"
          element={
            <RoleRoute allowedRoles={["admin"]} requireProfile={false}>
              <AdminDashboard />
            </RoleRoute>
          }
        />
        <Route
          path="/hospital"
          element={
            <RoleRoute allowedRoles={["hospital"]} requireProfile={false}>
              <HospitalDashboard />
            </RoleRoute>
          }
        />
      </Routes>
    </>
  );
}