"use client";

import { useState, type ReactNode } from "react";
import { MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import type { CoachConversationSummary } from "../../lib/coachHistoryContract";

interface CoachHistorySidebarProps {
  conversations: CoachConversationSummary[];
  activeId: string;
  disabled: boolean;
  onDelete: (id: string) => Promise<void>;
  onNew: () => void;
  onOpen: (id: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
}

export function CoachHistorySidebar(props: CoachHistorySidebarProps) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-neutral-800 bg-neutral-950/55 p-3 md:block">
        <HistoryList {...props} />
      </aside>
      <details className="border-b border-neutral-800 bg-neutral-950/55 md:hidden">
        <summary className="cursor-pointer px-4 py-2 text-xs text-neutral-400">
          Conversations ({props.conversations.length})
        </summary>
        <div className="max-h-64 overflow-y-auto p-3 pt-0">
          <HistoryList {...props} />
        </div>
      </details>
    </>
  );
}

function HistoryList(props: CoachHistorySidebarProps) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onNew}
        className="flex w-full items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-950/15 px-3 py-2 text-left text-xs text-amber-200 hover:bg-amber-950/30 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" /> New chat
      </button>
      <div aria-label="Coach conversations" className="space-y-1">
        {props.conversations.map((conversation) => (
          <ConversationRow key={conversation.id} conversation={conversation} {...props} />
        ))}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  activeId,
  disabled,
  onDelete,
  onOpen,
  onRename,
}: CoachHistorySidebarProps & { conversation: CoachConversationSummary }) {
  const [editing, setEditing] = useState(false);
  const active = activeId === conversation.id;

  const remove = async (): Promise<void> => {
    if (!window.confirm(`Delete “${conversation.title}”?`)) return;
    await onDelete(conversation.id);
  };

  return (
    <div className={`group rounded-lg border px-2 py-2 ${active ? "border-amber-500/25 bg-amber-950/15" : "border-transparent hover:bg-neutral-900/70"}`}>
      {editing ? (
        <TitleEditor
          current={conversation.title}
          disabled={disabled}
          onCancel={() => setEditing(false)}
          onSave={async (title) => {
            await onRename(conversation.id, title);
            setEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          disabled={disabled || active}
          onClick={() => void onOpen(conversation.id)}
          className="flex w-full items-center gap-2 text-left text-xs text-neutral-300 disabled:cursor-default"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
          <span className="truncate">{conversation.title}</span>
        </button>
      )}
      {!editing && (
        <div className="mt-1 flex justify-end gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <IconButton label="Rename conversation" disabled={disabled} onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </IconButton>
          <IconButton label="Delete conversation" disabled={disabled} onClick={() => void remove()}>
            <Trash2 className="h-3 w-3" />
          </IconButton>
        </div>
      )}
    </div>
  );
}

function TitleEditor({ current, disabled, onCancel, onSave }: {
  current: string;
  disabled: boolean;
  onCancel: () => void;
  onSave: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(current);

  const save = async (): Promise<void> => {
    const normalized = title.trim();
    if (!normalized || normalized === current) {
      onCancel();
      return;
    }
    await onSave(normalized);
  };

  return (
    <input
      aria-label="Conversation title"
      autoFocus
      disabled={disabled}
      maxLength={80}
      value={title}
      onBlur={() => void save()}
      onChange={(event) => setTitle(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") void save();
        if (event.key === "Escape") onCancel();
      }}
      className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-amber-500/40"
    />
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
