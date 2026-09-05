import { createContext, useContext, useState, ReactNode } from "react";

interface LLMStatusContextProps {
  llmUsed: boolean | null; // null = checking, true = active, false = deterministic
  setLLMUsed: (used: boolean | null) => void;
}

const LLMStatusContext = createContext<LLMStatusContextProps | undefined>(undefined);

export const LLMStatusProvider = ({ children }: { children: ReactNode }) => {
  const [llmUsed, setLLMUsed] = useState<boolean | null>(null);

  return (
    <LLMStatusContext.Provider value={{ llmUsed, setLLMUsed }}>
      {children}
    </LLMStatusContext.Provider>
  );
};

export const useLLMStatus = () => {
  const context = useContext(LLMStatusContext);
  if (context === undefined) {
    throw new Error("useLLMStatus must be used within an LLMStatusProvider");
  }
  return context;
};