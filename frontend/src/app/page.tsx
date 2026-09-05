"use client";

import { useState } from "react";
import LandingPage from "@/components/landing-page";
import ConsoleView from "@/components/console-view";

export default function Home() {
  const [showConsole, setShowConsole] = useState(false);

  const handleShowConsole = () => {
    setShowConsole(true);
  };

  const handleHideConsole = () => {
    setShowConsole(false);
  };

  if (showConsole) {
    return <ConsoleView onBack={handleHideConsole} />;
  }

  return <LandingPage onConsole={handleShowConsole} />;
}