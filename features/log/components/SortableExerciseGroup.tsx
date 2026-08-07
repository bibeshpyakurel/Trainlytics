"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Exercise } from "@/features/log/types";

type SortableExerciseGroupProps = {
  exercises: Exercise[];
  disabled?: boolean;
  onReorder: (orderedIds: string[]) => void;
  renderExercise: (ex: Exercise) => ReactNode;
};

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="10" height="2" rx="1" />
      <rect x="2" y="6" width="10" height="2" rx="1" />
      <rect x="2" y="10" width="10" height="2" rx="1" />
    </svg>
  );
}

function SortableExerciseItem({
  exercise,
  renderExercise,
  disabled,
}: {
  exercise: Exercise;
  renderExercise: (ex: Exercise) => ReactNode;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
      }}
      className={`flex items-stretch gap-1.5 ${isDragging ? "opacity-50" : ""}`}
    >
      {/* drag handle — touch-none prevents this element from triggering page scroll */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label="Drag to reorder"
        className={`touch-none flex w-8 shrink-0 cursor-grab select-none items-center justify-center rounded-xl border transition active:cursor-grabbing ${
          isDragging
            ? "border-amber-300/40 bg-amber-400/10 text-amber-300"
            : "border-zinc-700/50 bg-zinc-900/40 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400"
        }`}
      >
        <GripIcon />
      </button>
      <div className="min-w-0 flex-1">{renderExercise(exercise)}</div>
    </div>
  );
}

export default function SortableExerciseGroup({
  exercises,
  disabled,
  onReorder,
  renderExercise,
}: SortableExerciseGroupProps) {
  const [items, setItems] = useState<Exercise[]>(exercises);

  // Keep local order in sync when parent list changes (add/remove/external update)
  useEffect(() => {
    setItems(exercises);
  }, [exercises]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((e) => e.id === active.id);
    const newIndex = items.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);
    onReorder(newItems.map((e) => e.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((e) => e.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {items.map((ex) => (
            <SortableExerciseItem
              key={ex.id}
              exercise={ex}
              renderExercise={renderExercise}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
