import Nav from "../components/Nav";
import Hero from "../components/Hero";
import PainSolution from "../components/PainSolution";
import Features from "../components/Features";
import HowItWorks from "../components/HowItWorks";
import MobileWeb from "../components/MobileWeb";
import Pricing from "../components/Pricing";
import Faq from "../components/Faq";
import Footer, { FinalCta } from "../components/Footer";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <PainSolution />
        <Features />
        <HowItWorks />
        <MobileWeb />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
