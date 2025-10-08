import { createContext, useContext } from 'solid-js';
import { createStore } from 'solid-js/store';

export class StageConfig {
  stageStart: string = ""
}

export class EventConfig {
  eventName: string = '';
  stages: StageConfig[] = [];
}

interface EventConfigContextType {
  eventConfig: EventConfig;
  setEventConfig: (eventConfig: EventConfig) => void;
}

const EventConfigContext = createContext<EventConfigContextType>();

export function EventConfigProvider(props: { children: any }) {
  const [eventConfig, setEventConfig] = createStore(new EventConfig());

  const value = {
    eventConfig,
    setEventConfig,
  };

  return (
    <EventConfigContext.Provider value={value}>
      {props.children}
    </EventConfigContext.Provider>
  );
}

export function useEventConfig() {
  const context = useContext(EventConfigContext);
  if (!context) {
    throw new Error('useEventConfig must be used within an EventConfigProvider');
  }
  return context;
}
