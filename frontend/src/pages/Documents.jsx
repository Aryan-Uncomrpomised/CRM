import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatApiError } from "@/lib/api";
import { CATEGORIES, fmtDate } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  Presentation,
  FileSpreadsheet,
  FileSignature,
  File as FileIcon,
  Cloud,
  Lock,
} from "lucide-react";

const KINDS = [
  { value: "pitch_deck", label: "Pitch deck", icon: Presentation, admin: true },
  { value: "proposal", label: "Proposal", icon: FileText, admin: false },
  { value: "contract", label: "Contract", icon: FileSignature, admin: false },
  { value: "spreadsheet", label: "Spreadsheet", icon: FileSpreadsheet, admin: false },
  { value: "other", label: "Other", icon: FileIcon, admin: false },
];

const SOURCE_META = {
  google_drive: { label: "Google Drive", color: "#facc15" },
  onedrive: { label: "OneDrive", color: "#38bdf8" },
  link: { label: "Link", color: "#a1a1aa" },
};

export default function Documents() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [kind, setKind] = useState("all");
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ["documents", kind, category, q],
    queryFn: async () =>
      (
        await api.get("/documents", {
          params: {
            kind: kind === "all" ? undefined : kind,
            category: category === "all" ? undefined : category,
            q: q || undefined,
          },
        })
      ).data,
  });

  const del = async (id) => {
    if (!window.confirm("Delete this document reference?")) return;
    try {
      await api.delete(`/documents/${id}`);
      toast.success("Document removed");
      qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const visibleCats = isAdmin
    ? [{ value: "all", label: "All" }, ...CATEGORIES]
    : [{ value: "all", label: "All" }, { value: "consumer", label: "Consumer" }];

  return (
    <div className="p-8 space-y-6" data-testid="documents-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">
            files
          </div>
          <h1 className="font-display font-black text-4xl mt-1 tracking-tight">
            Documents <span className="text-white/40">& decks</span>
          </h1>
          <p className="text-white/50 text-sm mt-2 max-w-xl">
            Link files from your Google Drive or OneDrive here. Pitch decks and
            investor / B2B docs are admin-only.
          </p>
        </div>
        <Button
          data-testid="new-document-button"
          onClick={() => setShowNew(true)}
          className="bg-white text-black hover:bg-white/90"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Link document
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          data-testid="docs-search"
          placeholder="Search by name or description"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm h-9 bg-white/[0.03] border-white/10 text-sm"
        />
        <Tabs value={kind} onValueChange={setKind}>
          <TabsList className="bg-white/[0.03] border border-white/10">
            <TabsTrigger value="all" data-testid="doc-kind-all">All kinds</TabsTrigger>
            {KINDS.map((k) => (
              <TabsTrigger
                key={k.value}
                value={k.value}
                data-testid={`doc-kind-${k.value}`}
                disabled={k.admin && !isAdmin}
              >
                {k.label}
                {k.admin && !isAdmin && <Lock className="w-3 h-3 ml-1" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40 bg-white/[0.03] border-white/10 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {visibleCats.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {docs.map((d) => {
          const KM = KINDS.find((k) => k.value === d.kind) || KINDS[4];
          const KIcon = KM.icon;
          const SM = SOURCE_META[d.source] || SOURCE_META.link;
          const canDelete = d.owner === user?.name || isAdmin;
          return (
            <div
              key={d.id}
              data-testid={`doc-card-${d.id}`}
              className="border border-white/[0.08] rounded-md bg-[color:var(--vc-surface)] p-5 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                    <KIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-mono uppercase tracking-widest text-white/40">
                      {KM.label}
                      {d.kind === "pitch_deck" && (
                        <Lock className="w-3 h-3 ml-1 inline text-[color:var(--vc-lime)]" />
                      )}
                    </div>
                    <div className="font-display font-bold text-[15px] leading-tight mt-0.5 truncate">
                      {d.name}
                    </div>
                  </div>
                </div>
                <span
                  className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0"
                  style={{
                    color: SM.color,
                    borderColor: `${SM.color}55`,
                    background: `${SM.color}18`,
                  }}
                >
                  <Cloud className="w-3 h-3 inline mr-1" />
                  {SM.label}
                </span>
              </div>
              {d.description && (
                <p className="text-[13px] text-white/70 mt-3">{d.description}</p>
              )}
              {d.related_customer_name && (
                <div className="text-[11.5px] text-white/50 mt-2">
                  ↳ linked to <span className="text-white">{d.related_customer_name}</span>
                </div>
              )}
              {d.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {d.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-white/[0.08] bg-white/[0.03] rounded text-white/60"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                <div className="text-[10.5px] font-mono text-white/40">
                  {d.owner} · {fmtDate(d.created_at)}
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`doc-open-${d.id}`}
                    className="inline-flex items-center gap-1 text-[12px] text-sky-300 hover:text-sky-200 px-2 py-1 rounded hover:bg-white/[0.03]"
                  >
                    <ExternalLink className="w-3 h-3" /> Open
                  </a>
                  {canDelete && (
                    <button
                      onClick={() => del(d.id)}
                      data-testid={`doc-delete-${d.id}`}
                      className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-white/[0.03]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {docs.length === 0 && (
          <div className="col-span-3 border border-dashed border-white/10 rounded-md p-16 text-center text-white/40 font-mono text-sm">
            No documents match. Add a link to your Google Drive or OneDrive file.
          </div>
        )}
      </div>

      <NewDocumentDialog
        open={showNew}
        onOpenChange={setShowNew}
        isAdmin={isAdmin}
        onCreated={() => qc.invalidateQueries({ queryKey: ["documents"] })}
      />
    </div>
  );
}

function NewDocumentDialog({ open, onOpenChange, isAdmin, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    url: "",
    kind: "proposal",
    source: "google_drive",
    category: "consumer",
    description: "",
    tags: "",
  });

  const submit = async () => {
    if (!form.name.trim() || !form.url.trim())
      return toast.error("Name and URL are required");
    try {
      await api.post("/documents", {
        ...form,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      toast.success("Document linked");
      onCreated();
      onOpenChange(false);
      setForm({ ...form, name: "", url: "", description: "", tags: "" });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const availableKinds = isAdmin ? KINDS : KINDS.filter((k) => !k.admin);
  const availableCats = isAdmin
    ? CATEGORIES
    : CATEGORIES.filter((c) => c.value === "consumer");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[color:var(--vc-surface)] border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            Link document
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            data-testid="nd-name"
            placeholder="Document name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <Input
            data-testid="nd-url"
            placeholder="https://drive.google.com/… or OneDrive share link"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger data-testid="nd-kind" className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableKinds.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger data-testid="nd-source" className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google_drive">Google Drive</SelectItem>
                <SelectItem value="onedrive">OneDrive</SelectItem>
                <SelectItem value="link">Other link</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger data-testid="nd-category" className="bg-black/40 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableCats.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            data-testid="nd-desc"
            placeholder="Description / context"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="bg-black/40 border-white/10"
          />
          <Input
            data-testid="nd-tags"
            placeholder="Tags (comma-separated)"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            className="bg-black/40 border-white/10"
          />
        </div>
        <DialogFooter>
          <Button
            data-testid="nd-submit"
            onClick={submit}
            className="bg-white text-black hover:bg-white/90"
          >
            Link document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
