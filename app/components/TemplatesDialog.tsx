"use client";

import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useToast } from "../toast";
import { TaskTemplate, TaskTemplateItem } from "../lib/types";
import { createEmptyTemplate, deleteTemplate, loadTemplates, upsertTemplate } from "../lib/templates-local";
import { haptic } from "../lib/haptics";
import { newId } from "../lib/storage";
import Icon from "./Icon";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function TemplatesDialog({ open, onClose }: Props) {
  const { projects, addTask } = useStore();
  const toast = useToast();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [applyingTo, setApplyingTo] = useState<string | null>(null);

  useEffect(() => {
    if (open) setTemplates(loadTemplates());
  }, [open]);

  function refresh() {
    setTemplates(loadTemplates());
  }

  function apply(tpl: TaskTemplate, projectId: string | undefined) {
    tpl.items.forEach((item) => {
      addTask({
        title: item.title,
        priority: item.priority ?? "none",
        tags: item.tags ?? [],
        estimateMinutes: item.estimateMinutes,
        notes: item.notes,
        projectId,
      });
    });
    haptic("success");
    toast.show({
      message: `${tpl.items.length} tâche${tpl.items.length > 1 ? "s créées" : " créée"} depuis « ${tpl.name} »`,
      tone: "success",
    });
    setApplyingTo(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 anim-fade-in sm:items-center sm:p-4" onClick={() => { setEditing(null); onClose(); }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-[var(--bg-elev)] shadow-2xl anim-scale-in sm:max-h-[85vh] sm:max-w-xl sm:rounded-2xl sm:border sm:border-[var(--border)]"
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 safe-top">
          <div className="flex items-center gap-2">
            <Icon name="list" size={16} className="text-[var(--accent)]" />
            <h2 className="text-[15px] font-semibold">Modèles de tâches</h2>
          </div>
          <button onClick={() => { setEditing(null); onClose(); }} className="tappable flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {editing ? (
            <TemplateEditor
              template={editing}
              onChange={setEditing}
              onSave={() => {
                upsertTemplate(editing);
                refresh();
                setEditing(null);
                toast.show({ message: `Modèle « ${editing.name} » enregistré`, tone: "success" });
              }}
              onCancel={() => setEditing(null)}
              onDelete={() => {
                deleteTemplate(editing.id);
                refresh();
                setEditing(null);
                toast.show({ message: "Modèle supprimé" });
              }}
            />
          ) : applyingTo ? (
            <ProjectPicker
              projects={projects}
              onCancel={() => setApplyingTo(null)}
              onPick={(projectId) => {
                const tpl = templates.find((t) => t.id === applyingTo);
                if (tpl) apply(tpl, projectId);
              }}
            />
          ) : (
            <>
              <div className="mb-4 text-[12.5px] text-[var(--text-muted)]">
                Crée une liste réutilisable de tâches (ouverture, fermeture, admin…). Applique-la sur un projet en 1 clic.
              </div>
              <div className="space-y-2">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[20px]" style={{ background: `${t.color}20` }}>
                      {t.icon || "📋"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold">{t.name}</div>
                      <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                        {t.items.length} tâche{t.items.length > 1 ? "s" : ""}
                        {t.items.length > 0 && " · " + t.items.slice(0, 3).map((i) => i.title).join(" · ") + (t.items.length > 3 ? "…" : "")}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                      <button
                        onClick={() => setApplyingTo(t.id)}
                        className="rounded-md bg-[var(--accent)] px-3 py-1 text-[11.5px] font-medium text-white"
                      >
                        Utiliser
                      </button>
                      <button
                        onClick={() => setEditing(t)}
                        className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-[11.5px] text-[var(--text-muted)]"
                      >
                        Éditer
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setEditing(createEmptyTemplate())}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg)] py-3 text-[13px] font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                >
                  <Icon name="plus" size={14} />
                  Nouveau modèle
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  template: TaskTemplate;
  onChange: (t: TaskTemplate) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  function updateItem(idx: number, patch: Partial<TaskTemplateItem>) {
    const items = template.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ ...template, items });
  }
  function addItem() {
    onChange({ ...template, items: [...template.items, { title: "" }] });
  }
  function removeItem(idx: number) {
    onChange({ ...template, items: template.items.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <input
          value={template.icon ?? ""}
          onChange={(e) => onChange({ ...template, icon: e.target.value })}
          placeholder="📋"
          maxLength={3}
          className="w-14 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-center text-[18px] outline-none"
        />
        <input
          value={template.name}
          onChange={(e) => onChange({ ...template, name: e.target.value })}
          placeholder="Nom du modèle"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[14px] font-medium outline-none"
        />
      </div>

      <div className="space-y-1.5">
        {template.items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5">
            <input
              value={item.title}
              onChange={(e) => updateItem(idx, { title: e.target.value })}
              placeholder="Titre de la tâche"
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--text-subtle)]"
            />
            <select
              value={item.priority ?? "none"}
              onChange={(e) => updateItem(idx, { priority: e.target.value as TaskTemplateItem["priority"] })}
              className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[11px] outline-none"
            >
              <option value="none">–</option>
              <option value="low">Basse</option>
              <option value="medium">Moyenne</option>
              <option value="high">Haute</option>
              <option value="urgent">Urgente</option>
            </select>
            <button
              onClick={() => removeItem(idx)}
              className="rounded p-1 text-[var(--text-subtle)] hover:text-rose-600"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
        <button
          onClick={addItem}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border-strong)] py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          <Icon name="plus" size={11} />
          Ajouter une tâche
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
        <button
          onClick={() => {
            if (confirm("Supprimer ce modèle ?")) onDelete();
          }}
          className="text-[11.5px] text-rose-600 hover:underline"
        >
          Supprimer ce modèle
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--text-muted)]">Annuler</button>
          <button
            onClick={onSave}
            disabled={!template.name.trim() || template.items.some((i) => !i.title.trim())}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectPicker({
  projects,
  onPick,
  onCancel,
}: {
  projects: Array<{ id: string; name: string; color: string }>;
  onPick: (projectId: string | undefined) => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <div className="mb-3 text-[13px] text-[var(--text-muted)]">Dans quel projet appliquer ce modèle ?</div>
      <div className="space-y-1">
        <button
          onClick={() => onPick(undefined)}
          className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text)] hover:border-[var(--accent)]/40"
        >
          <Icon name="inbox" size={12} className="text-[var(--text-muted)]" />
          Aucun (à trier)
        </button>
        {projects.filter((p) => p.id !== "inbox").map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text)] hover:border-[var(--accent)]/40"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--text-muted)]">Annuler</button>
      </div>
    </div>
  );
}
