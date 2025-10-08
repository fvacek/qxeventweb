import { createSignal, createContext, useContext, Accessor } from 'solid-js';

interface StageContextType {
  currentStage: Accessor<number>;
  setCurrentStage: (stage: number) => void;
}

const StageContext = createContext<StageContextType>();

export function StageProvider(props: { children: any }) {
  const [currentStage, setCurrentStage] = createSignal(0);

  const value = {
    currentStage,
    setCurrentStage,
  };

  return (
    <StageContext.Provider value={value}>
      {props.children}
    </StageContext.Provider>
  );
}

export function useStage() {
  const context = useContext(StageContext);
  if (!context) {
    throw new Error('useStage must be used within a StageProvider');
  }
  return context;
}
