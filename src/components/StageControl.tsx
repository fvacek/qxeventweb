import { useStage } from "~/context/StageContext";
import { Button } from "./ui/button";

export function StageControl() {
  const { currentStage, setCurrentStage } = useStage();

  return (
    <div class="flex items-center gap-4">
      {/*<Button onClick={() => setCurrentStage(currentStage() - 1)} disabled={currentStage() === 0}>
        Previous Stage
      </Button>*/}
      <span class="outline rounded px-2 py-1">Stage {currentStage()}</span>
      {/*<Button onClick={() => setCurrentStage(currentStage() + 1)}>
        Next Stage
      </Button>*/}
    </div>
  );
}
