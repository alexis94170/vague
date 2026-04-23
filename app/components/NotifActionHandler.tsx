"use client";

import { useEffect } from "react";
import { useStore } from "../store";
import { useToast } from "../toast";
import { addDays, todayISO } from "../lib/dates";
import { haptic } from "../lib/haptics";
import { ViewKind } from "../lib/views";

type Props = {
  onNavigate?: (v: ViewKind) => void;
  onOpenNewTask?: () => void;
  onOpenAssistant?: () => void;
  onOpenPlan?: () => void;
  onPrefillNewTask?: (title: string, body?: string) => void;
};

export default function NotifActionHandler({
  onNavigate,
  onOpenNewTask,
  onOpenAssistant,
  onOpenPlan,
  onPrefillNewTask,
}: Props) {
  const { tasks, toggleDone, patchTask } = useStore();
  const toast = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    const action = params.get("action");
    const taskId = params.get("task");

    let touched = false;

    // View routing shortcut (?view=today)
    if (view && onNavigate) {
      const allowedViews = ["today", "all", "calendar", "dashboard", "waiting", "untriaged", "completed", "trash"];
      if (allowedViews.includes(view)) {
        onNavigate({ kind: view } as ViewKind);
        touched = true;
      }
    }

    // Reminder actions on a task (from notif click)
    if (taskId && action && ["done", "snooze1h", "snooze-tomorrow"].includes(action)) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        let label = "";
        if (action === "done" && !task.done) {
          toggleDone(taskId);
          label = `« ${task.title.slice(0, 40)} » marquée faite`;
        } else if (action === "snooze1h" && task.dueTime) {
          const [h, m] = task.dueTime.split(":").map(Number);
          const d = new Date();
          d.setHours(h + 1, m, 0, 0);
          patchTask(taskId, {
            dueTime: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
          });
          label = `« ${task.title.slice(0, 40)} » reportée de 1 h`;
        } else if (action === "snooze-tomorrow") {
          patchTask(taskId, { dueDate: addDays(todayISO(), 1) });
          label = `« ${task.title.slice(0, 40)} » reportée à demain`;
        }
        if (label) {
          haptic("success");
          toast.show({ message: label, tone: "success" });
        }
      }
      touched = true;
    }

    // Launcher shortcuts (?action=new|assistant|plan|share)
    if (action === "new") {
      onOpenNewTask?.();
      touched = true;
    } else if (action === "assistant") {
      onOpenAssistant?.();
      touched = true;
    } else if (action === "plan") {
      onOpenPlan?.();
      touched = true;
    } else if (action === "share") {
      const title = params.get("title") || params.get("text") || "";
      const body = params.get("url") || "";
      if (title && onPrefillNewTask) {
        onPrefillNewTask(title, body);
        touched = true;
      }
    }

    if (touched) {
      const url = new URL(window.location.href);
      ["task", "action", "view", "title", "text", "url"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.toString());
    }
    // Run once on mount — no deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
