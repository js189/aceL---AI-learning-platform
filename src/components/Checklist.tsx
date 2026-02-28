"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import type { ChecklistItem } from "@/types";

export function Checklist({
  items,
  onUpdate,
}: {
  items: ChecklistItem[];
  onUpdate: (items: ChecklistItem[]) => void;
}) {
  const [local, setLocal] = useState<ChecklistItem[]>(items);

  useEffect(() => {
    setLocal(items);
  }, [items]);

  const toggle = (id: string) => {
    const next = local.map((i) =>
      i.id === id ? { ...i, completed: !i.completed } : i
    );
    setLocal(next);
    onUpdate(next);
  };

  const completedCount = local.filter((i) => i.completed).length;

  return (
    <div className="rounded-card border border-warm-sand/80 bg-cream p-4 sm:p-6 shadow-subtle">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-deep-charcoal">Your Learning Checklist</h2>
        <span className="text-sm font-medium text-sage">
          {completedCount}/{local.length} completed
        </span>
      </div>
      <div className="h-1 rounded-full bg-warm-sand/80 mb-6">
        <div
          className="h-full rounded-full bg-sage transition-all"
          style={{ width: `${local.length ? (completedCount / local.length) * 100 : 0}%` }}
        />
      </div>
      <ul className="divide-y divide-warm-sand/50">
        {local.map((item, idx) => (
          <li
            key={item.id}
            className={`flex items-start gap-3 sm:gap-4 py-3 min-h-[52px] sm:min-h-0 ${idx === local.length - 1 ? "border-b-0" : ""}`}
          >
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className={`mt-0.5 flex h-6 w-6 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded border-2 transition touch-manipulation
                ${item.completed
                  ? "border-sage bg-sage text-white"
                  : "border-deep-charcoal/20 hover:border-dusty-blue active:border-dusty-blue"
                }`}
            >
              {item.completed && <Check size={12} strokeWidth={3} />}
            </button>
            <div className="min-w-0 flex-1">
              <span
                className={
                  item.completed
                    ? "text-deep-charcoal/60 line-through"
                    : "text-deep-charcoal"
                }
              >
                {item.title}
              </span>
              {item.source && (
                <span className="ml-2 text-xs text-deep-charcoal/50">
                  (from {item.source})
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
