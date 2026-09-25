import Hero from "../components/Hero";
import Stats from "../components/Stats";
import BloodGroups from "../components/BloodGroups";
import HowItWorks from "../components/HowItWorks";
import WhyDonate from "../components/WhyDonate";
import EmergencyBanner from "../components/EmergencyBanner";
import Eligibility from "../components/Eligibility";
import Awareness from "../components/Awareness";
import FAQ from "../components/FAQ";
import CTA from "../components/CTA";
import Footer from "../components/Footer";
import MobileQuickDock from "../components/MobileQuickDock";

export default function Home() {
  return (
    <>
      <Hero />
      <Stats />
      <BloodGroups />
      <HowItWorks />
      <WhyDonate />
      <EmergencyBanner />
      <Eligibility />
      <Awareness />
      <FAQ />
      <CTA />
      <Footer />
      <MobileQuickDock />
    </>
  );
}