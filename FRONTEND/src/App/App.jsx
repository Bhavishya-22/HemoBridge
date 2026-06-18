
import "../index.css";
import { Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import DonateBloodPage from "./pages/DonateBloodPage";
import RequestBloodPage from "./pages/RequestBloodPage";
import FAQPage from "./pages/FAQPage";
import ProfilePage from "./pages/ProfilePage";

export default function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/request" element={<RequestBloodPage />} />
        <Route path="/donate" element={<DonateBloodPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </>
  );
}