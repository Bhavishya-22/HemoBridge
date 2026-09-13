
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
import AdminDashboard from "./pages/AdminDashboard";
import HospitalDashboard from "./pages/HospitalDashboard";

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
        <Route path="/request" element={<RequestBloodPage />} />
        <Route path="/donate" element={<DonateBloodPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/hospital" element={<HospitalDashboard />} />
      </Routes>
    </>
  );
}