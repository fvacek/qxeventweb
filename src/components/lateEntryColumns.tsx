import type { TableColumn } from "~/components/ui/table";
import { effectiveStartTime, type LateEntryRow } from "~/lib/lateEntry";

export function fullName(lastname?: string, firstname?: string): string {
  return [lastname, firstname].filter(n => n?.trim()).join(" ");
}

export function ChangedValue(props: { original: string; changed?: string }) {
  if (props.changed === undefined) return <span>{props.original || "—"}</span>;

  return (
    <div class="flex flex-col leading-tight">
      <span class="line-through text-muted-foreground">{props.original || "—"}</span>
      <span class="font-bold">{props.changed || ""}</span>
    </div>
  );
}

export function formatStartTime(msec: number | undefined, start: Date | undefined): string {
  if (msec === undefined || !start) return "";
  const date = new Date(start.getTime() + msec);
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Compares possibly missing values, missing ones sort last. */
export function compareOptional<V extends string | number>(a: V | undefined, b: V | undefined): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return typeof a === "string" ? a.localeCompare(b as string) : (a as number) - (b as number);
}

/** Start time, name, registration and SI columns showing the original value and its change. */
export function changedValueColumns(stageStart: () => Date | undefined): TableColumn<LateEntryRow>[] {
  const originalName = (row: LateEntryRow) => fullName(row.run?.lastname, row.run?.firstname);
  return [
    {
      key: "starttimems",
      header: "Start Time",
      cell: (row: LateEntryRow) => {
        const changed = row.change?.lateEntry.starttimems;
        return (
          <ChangedValue
            original={formatStartTime(row.run?.starttimems, stageStart())}
            changed={changed !== undefined ? formatStartTime(changed, stageStart()) : undefined}
          />
        );
      },
      sortable: true,
      sortFn: (a: LateEntryRow, b: LateEntryRow) => compareOptional(effectiveStartTime(a), effectiveStartTime(b)),
    },
    {
      key: "name",
      header: "Name",
      cell: (row: LateEntryRow) => {
        const le = row.change?.lateEntry;
        const changedName = le?.firstname !== undefined || le?.lastname !== undefined
          ? fullName(le?.lastname ?? row.run?.lastname, le?.firstname ?? row.run?.firstname)
          : undefined;

        return <ChangedValue original={originalName(row)} changed={changedName} />;
      },
      sortable: true,
      sortFn: (a: LateEntryRow, b: LateEntryRow) => originalName(a).localeCompare(originalName(b)),
    },
    {
      key: "registration",
      header: "Reg",
      cell: (row: LateEntryRow) => <ChangedValue original={row.run?.registration || ""} changed={row.change?.lateEntry.registration} />,
      sortable: true,
      sortFn: (a: LateEntryRow, b: LateEntryRow) => compareOptional(a.run?.registration, b.run?.registration),
    },
    {
      key: "siid",
      header: "SI",
      cell: (row: LateEntryRow) => <ChangedValue original={row.run?.siid?.toString() || ""} changed={row.change?.lateEntry.siid?.toString()} />,
      sortable: false,
    },
  ];
}
