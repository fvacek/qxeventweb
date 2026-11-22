import { EventConfig, eventDate, eventName, eventTime } from "~/lib/eventConfig";
import type { EventRecord } from "~/schema/event-record-schema";

interface EventInfoProps {
  eventConfig: EventConfig;
  eventRecord: () => EventRecord | undefined;
}

const EventInfo = ({ eventConfig, eventRecord }: EventInfoProps) => {
  return (
    <div class="shadow-lg rounded-lg p-6">
      <h2 class="text-2xl font-semibold mb-4">Event Information</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-muted-foreground mb-1">Name</label>
          <p class="text-lg">{eventName(eventConfig, eventRecord()) || 'N/A'}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-muted-foreground mb-1">Place</label>
          <p class="text-lg">{eventConfig.place || 'N/A'}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-muted-foreground mb-1">Date</label>
          <p class="text-lg">{eventDate(eventConfig, eventRecord())?.toLocaleDateString() || 'N/A'}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-muted-foreground mb-1">Time</label>
          <p class="text-lg">{eventTime(eventConfig, eventRecord()) || 'N/A'}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-muted-foreground mb-1">Stages</label>
          <p class="text-lg">{eventConfig.stageCount}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-muted-foreground mb-1">Current stage</label>
          <p class="text-lg">{eventConfig.currentStage}</p>
        </div>
      </div>

      {eventConfig.stages.length > 0 && (
        <div class="mt-6">
          <h3 class="text-lg font-medium mb-3">Stage Information</h3>
          <div class="space-y-2">
            {eventConfig.stages.map((stage, index) => (
              <div class="flex justify-between items-center py-2 px-3 rounded">
                <span class="font-medium">Stage {index + 1}</span>
                <span>start: {stage.stageStart?.toLocaleString() ?? 'N/A'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventInfo;
