import Nav from "../components/Nav";
import Hero from "../components/Hero";
import PainSolution from "../components/PainSolution";
import WhoItsFor from "../components/WhoItsFor";
import Comparison from "../components/Comparison";
import Features from "../components/Features";
import HowItWorks from "../components/HowItWorks";
import MobileWeb from "../components/MobileWeb";
import Trust from "../components/Trust";
import Pricing from "../components/Pricing";
import Faq from "../components/Faq";
import Contact from "../components/Contact";
import Footer, { FinalCta } from "../components/Footer";
import StickyCta from "../components/StickyCta";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <PainSolution />
        <WhoItsFor />
        <Comparison />
        <Features />
        <HowItWorks />
        <MobileWeb />
        <Trust />
        <Pricing />
        <Faq />
        <Contact />
        <FinalCta />
      </main>
      <Footer />
      <StickyCta />
    </>
  );
}
