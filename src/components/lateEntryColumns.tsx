import type { TableColumn } from "~/components/ui/table";
import { compareOptional, effectiveStartTime, formatStartTime, fullName, type RunnerEntryRow } from "~/lib/runnerEntry";

export function ChangedValue(props: { original: string; changed?: string }) {
  if (props.changed === undefined) return <span>{props.original || "—"}</span>;

  return (
    <div class="flex flex-col leading-tight">
      <span class="line-through text-muted-foreground">{props.original || "—"}</span>
      <span class="font-bold">{props.changed || ""}</span>
    </div>
  );
}

/** Start time, name, registration and SI columns showing the original value and its change. */
export function changedValueColumns(stageStart: () => Date | undefined): TableColumn<RunnerEntryRow>[] {
  const originalName = (row: RunnerEntryRow) => fullName(row.run?.lastname, row.run?.firstname);
  return [
    {
      key: "starttimems",
      header: "Start Time",
      cell: (row: RunnerEntryRow) => {
        const changed = row.change?.lateEntry.starttimems;
        return (
          <ChangedValue
            original={formatStartTime(row.run?.starttimems, stageStart())}
            changed={changed !== undefined ? formatStartTime(changed, stageStart()) : undefined}
          />
        );
      },
      sortable: true,
      sortFn: (a: RunnerEntryRow, b: RunnerEntryRow) => compareOptional(effectiveStartTime(a), effectiveStartTime(b)),
    },
    {
      key: "name",
      header: "Name",
      cell: (row: RunnerEntryRow) => {
        const le = row.change?.lateEntry;
        const changedName = le?.firstname !== undefined || le?.lastname !== undefined
          ? fullName(le?.lastname ?? row.run?.lastname, le?.firstname ?? row.run?.firstname)
          : undefined;

        return <ChangedValue original={originalName(row)} changed={changedName} />;
      },
      sortable: true,
      sortFn: (a: RunnerEntryRow, b: RunnerEntryRow) => originalName(a).localeCompare(originalName(b)),
    },
    {
      key: "registration",
      header: "Reg",
      cell: (row: RunnerEntryRow) => <ChangedValue original={row.run?.registration || ""} changed={row.change?.lateEntry.registration} />,
      sortable: true,
      sortFn: (a: RunnerEntryRow, b: RunnerEntryRow) => compareOptional(a.run?.registration, b.run?.registration),
    },
    {
      key: "siid",
      header: "SI",
      cell: (row: RunnerEntryRow) => <ChangedValue original={row.run?.siid?.toString() || ""} changed={row.change?.lateEntry.siid?.toString()} />,
      sortable: false,
    },
  ];
}
