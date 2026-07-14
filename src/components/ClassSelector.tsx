import { createEffect, createSignal } from "solid-js";

import { FlexDropdown } from "~/components/ui/flexdropdown";
import { showToast } from "~/components/ui/toast";
import { useAppConfig } from "~/context/AppConfig";
import { useWsClient } from "~/context/WsClient";
import { createSqlTable } from "~/lib/SqlTable";
import { callRpcMethod } from "~/lib/rpc";

export type ClassDef = {
  id: number;
  name: string;
  start: number;
  interval: number;
  mapCount: number;
};

export function ClassSelector(props: {
  className: () => string;
  setClassName: (name: string) => void;
  setClassDef: (cd: ClassDef) => void;
  eventId: () => number;
  workingStage: () => number | undefined;
}) {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const [classes, setClasses] = createSignal<ClassDef[]>([]);

  async function loadClasses() {
    try {
      const result = await callRpcMethod(
        wsClient()!,
        appConfig.eventSqlApiPath(props.eventId()),
        "query",
        [`SELECT classes.id, classes.name,
          classdefs.startTimeMin, classdefs.startIntervalMin, classdefs.mapCount
          FROM classes, classdefs
          WHERE classdefs.classid = classes.id AND classdefs.stageid = ${props.workingStage() ?? 0}
          ORDER BY classes.name`],
      );
      const table = createSqlTable(result);
      const classlist: ClassDef[] = Array.from({ length: table.rowCount() }, (_, i) => ({
        id: Number(table.get(i, "id")),
        name: String(table.get(i, "name")),
        start: Number(table.get(i, "startTimeMin")),
        interval: Number(table.get(i, "startIntervalMin")),
        mapCount: Number(table.get(i, "mapCount")),
      }));
      setClasses(classlist);
      if (classlist.length > 0) {
        props.setClassName(classlist[0].name);
        props.setClassDef(classlist[0]);
      }
    } catch (error) {
      showToast({ title: "Load classes error", description: (error as Error).message, variant: "destructive" });
    }
  }

  createEffect(() => {
    if (status() === "Connected") loadClasses();
  });

  const selectClass = (name: string) => {
    const selectedClass = classes().find(c => c.name === name);
    props.setClassName(name);
    if (selectedClass) props.setClassDef(selectedClass);
  };

  return (
    <div class="w-full">
      {props.className() && (
        <FlexDropdown
          value={props.className()}
          options={classes().map(c => c.name)}
          onSelect={selectClass}
          variant="default"
          fullWidth={true}
        />
      )}
    </div>
  );
}
