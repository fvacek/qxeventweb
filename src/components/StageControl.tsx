import { Accessor } from "solid-js";
import { Button } from "./ui/button";

export function StageControl(props: {
  currentStage: Accessor<number>;
}) {

  return (
    <div class="flex items-center gap-4">
      <span class="outline rounded px-2 py-1">Stage {props.currentStage()}</span>
    </div>
  );
}
