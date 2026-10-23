"use client";

import { Suspense, useState, type FormEvent } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateUserMutation, useDeleteUserMutation, useGetUsersQuery } from "@/state/api";
import { useIsAdmin } from "@/lib/hooks";
import { useSearchBox, useUrlState } from "@/lib/useUrlState";
import { date, errorMessage } from "@/lib/format";
import {
  Button,
  cx,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  SkeletonRows,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

function AddPersonDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [error, setError] = useState("");
  const [create, { isLoading }] = useCreateUserMutation();

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await create({ name, email, role }).unwrap();
      toast.success(`Added ${name}`);
      setName("");
      setEmail("");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a person"
      description="Adds them to the team list. To let them sign in, also invite them in Cognito."
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="person-form" loading={isLoading}>
            Add person
          </Button>
        </>
      }
    >
      <form id="person-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">{(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
        <Field label="Email">
          {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Role">
          {(id) => (
            <Select id={id} value={role} onChange={(e) => setRole(e.target.value as "staff" | "admin")}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </Select>
          )}
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function TeamView() {
  const isAdmin = useIsAdmin();
  const [s, set] = useUrlState({ q: "", page: "1" });
  const [search, setSearch] = useSearchBox(s.q, set);
  const [adding, setAdding] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useGetUsersQuery({ q: s.q, page: Number(s.page) || 1, pageSize: 20 });
  const [remove] = useDeleteUserMutation();

  return (
    <>
      <PageHeader
        title="Team"
        description="The people who work in your stockroom."
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden /> Add person
            </Button>
          )
        }
      />
      <div className="mb-4 relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input
          type="search"
          aria-label="Search people"
          placeholder="Name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className={cx("overflow-hidden rounded-xl border border-line bg-panel", isFetching && !isLoading && "opacity-70")}>
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Added</Th>
                  {isAdmin && (
                    <Th className="w-0">
                      <span className="sr-only">Actions</span>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoading && <SkeletonRows cols={isAdmin ? 5 : 4} />}
                {data?.items.map((u) => (
                  <tr key={u.userId}>
                    <Td className="font-medium">
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
                        >
                          {u.name.slice(0, 2).toUpperCase()}
                        </span>
                        {u.name}
                      </span>
                    </Td>
                    <Td className="text-ink-2">
                      <a href={`mailto:${u.email}`} className="hover:underline">
                        {u.email}
                      </a>
                    </Td>
                    <Td>
                      <span
                        className={cx(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          u.role === "admin" ? "bg-accent-soft text-accent" : "bg-panel-2 text-ink-2",
                        )}
                      >
                        {u.role === "admin" ? "Admin" : "Staff"}
                      </span>
                    </Td>
                    <Td className="text-ink-2">{date(u.createdAt)}</Td>
                    {isAdmin && (
                      <Td>
                        <IconButton
                          label={`Remove ${u.name}`}
                          onClick={async () => {
                            if (!confirm(`Remove ${u.name} from the team list?`)) return;
                            try {
                              await remove(u.userId).unwrap();
                              toast.success(`Removed ${u.name}`);
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableShell>
            {data && data.total === 0 && <EmptyState title={s.q ? `No one matches “${s.q}”` : "No one here yet"} />}
            {data && (
              <Pagination
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={data.pageSize}
                onPage={(p) => set({ page: String(p) })}
              />
            )}
          </>
        )}
      </div>
      <AddPersonDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

export default function TeamPage() {
  return (
    <Suspense>
      <TeamView />
    </Suspense>
  );
}
