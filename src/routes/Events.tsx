import { Index, createMemo, createSignal, createEffect, untrack } from "solid-js";
import QRCode from "qrcode";

import { Button } from "~/components/ui/button";
import {
  Table,
  TableColumn,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { useWsClient } from "~/context/WsClient";
import { showToast } from "~/components/ui/toast";
import { useAppConfig } from "~/context/AppConfig";
import { useAuth } from "~/context/AuthContext";

import { useSubscribe } from "~/context/SubscribeContext";
import { parse } from "valibot";
import {
  copyRecordChanges as copyValidFieldsToRpcMap,
  isRecordEmpty,
  makeMapRecursive,
  rpcMapToObject,
} from "~/lib/utils";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";
import { SwitchField } from "~/components/ui/switch";
import { DateTimeField } from "~/components/ui/date-time-field";
import {
  EventRecordSchema,
  EventRecordTableSchema,
  type EventRecord,
  type EventTableRecord,
} from "~/schema/event-record-schema";

const MEMBER_ROLES = ["Organizer", "Banned"] as const;
type MemberRole = typeof MEMBER_ROLES[number];

function normalizeMemberRole(role: string): MemberRole {
  return role === "Banned" ? "Banned" : "Organizer";
}

function EventsTable() {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const { user } = useAuth();
  const { recchngReceived } = useSubscribe();

  const [tableRecords, setTableRecords] = createSignal<EventTableRecord[]>([]);

  const [loading, setLoading] = createSignal(false);

  createEffect(() => {
    const recchng = recchngReceived();
    if (recchng) {
      untrack(() => {
        // setTableRecords() causes infinite reactive recursion without this untrack
        // nobody knows why
        processRecChng(recchng);
      });
    }
  });

  const processRecChng = (recchng: RecChng) => {
    const { table, id, record, op } = recchng;
    if (table === "events") {
      if (op === SqlOperation.Update) {
        const originalEvent = tableRecords().find(rec => rec.id === id);
        if (!!originalEvent) {
          const updatedEvent = { ...originalEvent, ...record };
          setTableRecords(prev => prev.map(event => event.id === updatedEvent.id ? updatedEvent : event));
        }
      } else if (op === SqlOperation.Insert) {
        const originalEvent: EventTableRecord = {
            id: id,
            name: undefined,
            date: undefined,
            owner: "",
            is_local: true,
        };
        const updatedEvent = { ...originalEvent, ...record };
        setTableRecords(prev => [...prev, updatedEvent]);
      } else if (op === SqlOperation.Delete) {
        setTableRecords(prev => prev.filter(event => event.id !== id));
      }
    }
  };

  const reloadTable = async () => {
    setLoading(true);

    try {
      const sql_select_result = await callRpcMethod(
        wsClient(),
        `${appConfig.eventCtlApiPath()}`,
        "listEvents",
      );
      const record_list = parse(EventRecordTableSchema, sql_select_result);
      setTableRecords(record_list);
    } catch (error) {
      console.error("RPC call failed:", error);
      showToast({
        title: "Reload table error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
    setLoading(false);

    // // Update data with fresh timestamps and randomized data
    // const refreshedEntries = tableRecords().map((entry) => ({
    //   ...entry,
    // }));

    // setTableRecords(refreshedEntries);
    // setLoading(false);
  };

  const createEvent = async () => {
    const currentUser = user();
    try {
      const result = await callRpcMethod(
        wsClient(),
        `${appConfig.eventCtlApiPath()}`,
        "createEvent",
        currentUser?.email || "",
      );
      if (Array.isArray(result)) {
        if (typeof result[0] === 'number') {
          const eventId = result[0];
          showToast({
            title: `Create event ${eventId} success`,
          });
          // Reload table to show new record
          // await reloadTable(); recchng will do this
          openEditRecordDialog(eventId);
        }
      }
    } catch (error) {
      showToast({
        title: "Create event error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  // Edit dialog state — single signal holds the record being edited (null = closed)
  const [formData, setFormData] = createSignal<EventRecord | null>(null);

  const isFormValid = () => !!(formData()?.name?.trim());

  const formMembers = createMemo(() =>
    Object.entries(formData()?.config?.members ?? {})
      .map(([member, role]) => [member, normalizeMemberRole(role)] as const)
  );
  const updateFormMembers = (updater: (members: Record<string, string>) => Record<string, string>) => {
    setFormData(prev => {
      if (!prev) return null;
      const members = updater(prev.config?.members ?? {});
      return { ...prev, config: { ...(prev.config ?? {}), members } };
    });
  };

  const addMember = () => {
    updateFormMembers(members => {
      let key = "member@example.com";
      let index = 2;
      while (Object.prototype.hasOwnProperty.call(members, key)) {
        key = `member${index}@example.com`;
        index += 1;
      }
      return { ...members, [key]: "Organizer" };
    });
  };

  const updateMemberKey = (oldKey: string, newKey: string) => {
    updateFormMembers(members => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(members)) {
        next[key === oldKey ? newKey : key] = value;
      }
      return next;
    });
  };

  const updateMemberValue = (key: string, value: MemberRole) => {
    updateFormMembers(members => ({ ...members, [key]: value }));
  };

  const removeMember = (key: string) => {
    updateFormMembers(members => {
      const next = { ...members };
      delete next[key];
      return next;
    });
  };

  const [qrCodeDataURL, setQrCodeDataURL] = createSignal<string>("");

  // Regenerate QR code only when api_token changes
  createEffect(() => {
    const token = formData()?.api_token;
    if (!token) { setQrCodeDataURL(""); return; }
    QRCode.toDataURL(`https://qxqx.org/event?api_token=${token}`, {
      width: 200, margin: 2, color: { dark: '#000000', light: '#FFFFFF' }
    }).then(setQrCodeDataURL).catch(() => setQrCodeDataURL(""));
  });

  const openEditRecordDialog = async (id: number) => {
    try {
      const eventData = await callRpcMethod(wsClient()!, appConfig.eventCtlApiPath(), "readEventRecord", id);
      const record = parse(EventRecordSchema, rpcMapToObject(eventData));
      setFormData(record);
    } catch (error) {
      showToast({ title: "Open event error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const closeDialog = () => setFormData(null);

  const acceptEditRecordDialog = () => {
    const record = formData();
    if (!record || !isFormValid()) return;
    closeDialog();
    updateRecordInDb(record);
  };

  const deleteEditedRecord = async () => {
    const record = formData();
    if (record?.api_token) {
      closeDialog();
      await deleteRecordInDb(record.api_token);
    }
  };

  const updateRecordInDb = async (record: EventRecord) => {
    // Find the current version in the table to diff against
    const original = tableRecords().find(r => r.id === record.id);
    if (!original) return;
    try {
      const recChanges = copyValidFieldsToRpcMap(original, record);
      if (!isRecordEmpty(recChanges)) {
        const params = [record.id, makeMapRecursive(recChanges)];
        await callRpcMethod(wsClient()!, appConfig.eventCtlApiPath(), "updateEventRecord", params);
        showToast({ title: "Update event success" });
      }
    } catch (error) {
      showToast({ title: "Update event error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const deleteRecordInDb = async (api_token: string) => {
    try {
      let res = await callRpcMethod(
        wsClient(),
        `${appConfig.qxeventdPath}/event`,
        "deleteEvent",
        api_token,
      );
      if (res) {
        showToast({
          title: "Delete event success",
        });
      } else {
        throw new Error("Failed to delete event");
      }
    } catch (error) {
      console.error("Error deleting event:", error);
      showToast({
        title: "Delete event error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };



  createEffect(() => {
    if (status() === "Connected") {
      reloadTable();
    }
  });

  // Table columns configuration with sorting - optimized for mobile
  const columns: TableColumn<EventRecord>[] = [
    {
      key: "id",
      header: "ID",
      cell: (rec: EventRecord) => {
        return <span class="text-sm">{rec.id}</span>;
      },
      sortable: true,
      width: "50px",
      hidden: "hidden sm:table-cell",
    },
    {
      key: "name",
      header: "Name",
      cell: (rec: EventRecord) => {
        return <span class="text-sm truncate max-w-30 block" title={rec.name}><a href={`event/${rec.id}`}>{rec.name}</a></span>;
      },
      sortable: true,
      width: "120px",
    },
    {
      key: "date",
      header: "Date",
      cell: (rec: EventRecord) => {
        return <span class="text-sm truncate max-w-25 block" title={rec.date}>{rec.date}</span>;
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "owner",
      header: "Owner",
      cell: (rec: EventRecord) => {
        return <span class="text-sm truncate max-w-25 block" title={rec.owner}>{rec.owner}</span>;
      },
      sortable: true,
      width: "100px",
      hidden: "hidden sm:table-cell",
    },
    {
      key: "is_local",
      header: "Local",
      cell: (rec: EventRecord) => {
        return <span class="text-sm truncate max-w-25 block">{rec.is_local ? "local" : "remote"}</span>;
      },
      sortable: true,
      width: "100px",
      hidden: "hidden sm:table-cell",
    },
    {
      key: "actions",
      header: "Edit",
      cell: (rec: EventRecord) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openEditRecordDialog(rec.id)}
          disabled={user()?.email != rec.owner}
          class="text-xs px-2 py-1 h-7"
        >
          Edit
        </Button>
      ),
      sortable: false,
      width: "60px",
    },
  ];

  return (
    <div class="w-full">
      <div class="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 class="text-xl sm:text-2xl font-bold">Events</h2>
        <div class="flex gap-2 flex-wrap">
          <Button onClick={createEvent} size="sm" class="text-xs" disabled={!user()?.email}>Create event</Button>
          <Button variant="outline" onClick={reloadTable} disabled={loading()} size="sm" class="text-xs">
            {loading() ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Mobile-optimized table with compact styling */}
      <div class="rounded-md border overflow-x-auto min-w-0">
        <div class="min-w-105">
          <Table
            data={tableRecords()}
            columns={columns}
            loading={loading()}
            emptyMessage="No events found"
            variant="striped"
            sortable={true}
            globalFilter={true}
            onSortChange={(sort: any) => console.log("Sort changed:", sort)}
            class="text-sm w-full table-fixed"
          />
        </div>
      </div>

      <Dialog open={!!formData()} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent class="max-w-md md:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField>
              <TextFieldLabel>ID</TextFieldLabel>
              <TextFieldInput value={formData()?.id.toString() ?? ""} type="number" readOnly />
            </TextField>

            <TextField>
              <TextFieldLabel>Name *</TextFieldLabel>
              <TextFieldInput
                value={formData()?.name || ""}
                type="text"
                onInput={(e) => setFormData(prev => prev ? { ...prev, name: e.currentTarget.value || undefined } : null)}
                class={!isFormValid() ? "border-red-500" : ""}
              />
              {!isFormValid() && <div class="text-sm text-red-500 mt-1">Name is required</div>}
            </TextField>

            <DateTimeField
              label="Date"
              value={formData()?.date}
              onChange={(date) => setFormData(prev => prev ? { ...prev, date } : null)}
            />

            <TextField>
              <TextFieldLabel>API token</TextFieldLabel>
              <TextFieldInput value={formData()?.api_token || ""} type="text" readOnly />
            </TextField>

            {qrCodeDataURL() && (
              <div class="flex flex-col items-center space-y-2">
                <img src={qrCodeDataURL()} alt="Event QR Code" class="border rounded-lg shadow-sm" />
                <div class="text-xs text-gray-500 text-center max-w-xs break-all">
                  {`https://qxqx.org/event?api_token=${formData()?.api_token}`}
                </div>
              </div>
            )}

            <TextField>
              <TextFieldLabel>Owner</TextFieldLabel>
              <TextFieldInput
                value={formData()?.owner || ""}
                type="text"
                onInput={(e) => setFormData(prev => prev ? { ...prev, owner: e.currentTarget.value } : null)}
              />
            </TextField>
            <SwitchField
              label="Local Event DB"
              checked={Boolean(formData()?.is_local)}
              onChange={(checked) => setFormData(prev => prev ? { ...prev, is_local: checked } : null)}
            />

            <div class="space-y-3 rounded-md border border-border p-3 md:col-span-2">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="font-semibold">Members</h3>
                  <p class="text-xs text-muted-foreground">Manage event member permissions.</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addMember}>➕</Button>
              </div>

              {formMembers().length === 0 ? (
                <p class="text-sm text-muted-foreground">No members configured.</p>
              ) : (
                <div class="space-y-2">
                  <Index each={formMembers()}>{(entry) => (
                    <div class="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_8rem_auto]">
                      <input
                        value={entry()[0]}
                        onInput={(e) => updateMemberKey(entry()[0], e.currentTarget.value)}
                        aria-label="Member"
                        placeholder="email@example.com"
                        class="min-w-0 rounded-md border border-border bg-input px-3 py-2 text-sm"
                      />
                      <select
                        value={entry()[1]}
                        onChange={(e) => updateMemberValue(entry()[0], e.currentTarget.value as MemberRole)}
                        aria-label="Role"
                        class="min-w-0 rounded-md border border-border bg-input px-3 py-2 text-sm"
                      >
                        <option value="Organizer">Organizer</option>
                        <option value="Banned">Banned</option>
                      </select>
                      <Button type="button" variant="destructive" size="sm" onClick={() => removeMember(entry()[0])} aria-label="Remove member" title="Remove member">➖</Button>
                    </div>
                  )}</Index>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              const name = formData()?.name;
              if (confirm(`Are you sure you want to delete the event "${name || 'this event'}"?\n\nThis action cannot be undone.`))
                deleteEditedRecord();
            }}>Delete</Button>
            <Button onClick={acceptEditRecordDialog} disabled={!isFormValid()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}

const Events = () => {
  return (
    <div class="flex w-full flex-col items-center justify-center px-2 sm:px-4">
      <h1 class="mt-7 mb-7 text-2xl sm:text-3xl font-bold">Events</h1>
      <div class="w-full max-w-full sm:max-w-7xl space-y-4">
        <EventsTable />
      </div>
    </div>
  );
};

export default Events;
