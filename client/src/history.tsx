import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { SavedExercise, Workout as SavedWorkout, WorkoutDetailResponse, WorkoutExerciseInput, WorkoutHistoryItem } from "@gatorgainz/types";
import { api, errorMessage, localDate } from "./api";
import { workouts as catalog } from "./catalog";
import { formatMinutes } from "./profile";
import { Button, Card, Icon, Label, PageTitle, type IconName } from "./ui";

const categoryIcon: Record<SavedWorkout["category"], [IconName, string]> = {
  strength: ["dumbbell", "lavender"],
  cardio: ["bolt", "mint"],
  mobility: ["fire", "coral"],
};

const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** Click-outside and Escape close the sheet. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={dialogRef} className="sheet-backdrop" aria-label={title} onCancel={(event) => {
      event.preventDefault();
      onClose();
    }}>
      <button type="button" className="sheet-dismiss" aria-label="Dismiss dialog" tabIndex={-1} onClick={onClose} />
      <div className="sheet card">
        <Button className="sheet-close icon-button" label="Close" onClick={onClose}><Icon name="x" size={18} /></Button>
        {children}
      </div>
    </dialog>
  );
}

type EditableExercise = SavedExercise & { key: string };

function limitsFor(name: string) {
  const entry = catalog.find((item) => item.name === name);
  const metric = entry?.cardioMetric;
  return { metric, cardio: entry?.tracking === "cardio" };
}

function WorkoutEditor({ detail, onCancel, onSaved }: { detail: WorkoutDetailResponse; onCancel: () => void; onSaved: () => void }) {
  const { workout } = detail;
  const [name, setName] = useState(workout.name);
  const [category, setCategory] = useState<SavedWorkout["category"]>(workout.category);
  const [duration, setDuration] = useState(workout.durationMinutes);
  const [date, setDate] = useState(workout.completedAt);
  const [exercises, setExercises] = useState<EditableExercise[]>(
    detail.exercises.map((exercise, index) => ({ ...exercise, key: `${index}-${exercise.name}` })),
  );
  const [adding, setAdding] = useState(catalog[0].name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (key: string, field: keyof SavedExercise, value: number) =>
    setExercises((current) => current.map((exercise) => (exercise.key === key ? { ...exercise, [field]: value } : exercise)));

  function addExercise() {
    const entry = catalog.find((item) => item.name === adding)!;
    const cardio = entry.tracking === "cardio" && entry.cardioMetric;
    setExercises((current) => [...current, {
      key: `${Date.now()}-${entry.name}`,
      name: entry.name,
      group: entry.group,
      tracking: cardio ? "cardio" : "strength",
      sets: cardio ? 0 : 3,
      reps: cardio ? 0 : 8,
      minutes: cardio ? 20 : 0,
      metricValue: cardio ? entry.cardioMetric!.initial : 0,
    }]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim() || name.trim().length > 120) return setError("Name must be 1–120 characters.");
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440) return setError("Duration must be 1–1440 minutes.");
    if (date > localDate()) return setError("The date cannot be in the future.");
    const body: WorkoutExerciseInput[] = exercises.map((exercise) =>
      exercise.tracking === "cardio"
        ? { name: exercise.name, minutes: exercise.minutes, metricValue: exercise.metricValue }
        : { name: exercise.name, sets: exercise.sets, reps: exercise.reps });
    setSaving(true);
    try {
      await api.updateWorkout(workout.id, {
        name: name.trim(),
        category,
        durationMinutes: duration,
        completedAt: date,
        ...(body.length ? { exercises: body } : {}),
      });
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="workout-editor" onSubmit={save}>
      <Label>Edit workout</Label>
      <div className="editor-grid">
        <label className="wide"><span>Name</span><input value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} /></label>
        <label><span>Type</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as SavedWorkout["category"])}>
            <option value="strength">Strength</option><option value="cardio">Cardio</option><option value="mobility">Mobility</option>
          </select>
        </label>
        <label><span>Minutes</span><input type="number" min={1} max={1440} value={duration} onChange={(e) => setDuration(Math.round(Number(e.target.value)))} /></label>
        <label><span>Date</span><input type="date" max={localDate()} value={date} required onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <div className="editor-exercises">
        <span className="editor-heading">Exercises</span>
        {exercises.length === 0 && <p className="empty-message">No exercises: this workout will earn no points.</p>}
        {exercises.map((exercise) => {
          const { metric } = limitsFor(exercise.name);
          return (
            <div className="editor-exercise" key={exercise.key}>
              <strong>{exercise.name}</strong>
              {exercise.tracking === "cardio" ? (
                <>
                  <label><span>Min</span><input type="number" min={1} max={600} value={exercise.minutes} onChange={(e) => update(exercise.key, "minutes", Math.round(Number(e.target.value)))} /></label>
                  <label><span>{metric?.unit ?? "amount"}</span><input type="number" min={metric?.min ?? 1} max={metric?.max ?? 100000} step={metric?.step ?? 1} value={exercise.metricValue} onChange={(e) => update(exercise.key, "metricValue", Number(e.target.value))} /></label>
                </>
              ) : (
                <>
                  <label><span>Sets</span><input type="number" min={1} max={20} value={exercise.sets} onChange={(e) => update(exercise.key, "sets", Math.round(Number(e.target.value)))} /></label>
                  <label><span>Reps</span><input type="number" min={1} max={100} value={exercise.reps} onChange={(e) => update(exercise.key, "reps", Math.round(Number(e.target.value)))} /></label>
                </>
              )}
              <Button className="mini-text-button" label={`Remove ${exercise.name}`} onClick={() => setExercises((current) => current.filter((item) => item.key !== exercise.key))}>Remove</Button>
            </div>
          );
        })}
        {exercises.length < 50 && (
          <div className="editor-add">
            <select aria-label="Exercise to add" value={adding} onChange={(e) => setAdding(e.target.value)}>
              {catalog.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.group})</option>)}
            </select>
            <Button className="secondary-button" onClick={addExercise}><Icon name="plus" size={14} /> Add</Button>
          </div>
        )}
      </div>
      <p className="board-note">Points are recalculated by the server when you save, using the same scoring version as before.</p>
      {error && <div className="auth-message" role="alert">{error}</div>}
      <div className="form-actions">
        <Button className="secondary-button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
      </div>
    </form>
  );
}

function WorkoutSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<WorkoutDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError("");
    api.workoutDetail(id).then(setDetail).catch((failure) => setError(errorMessage(failure)));
  }, [id]);
  useEffect(load, [load]);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteWorkout(id);
      onChanged();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  const awardFor = (name: string, index: number) => detail?.award?.exercises[index]?.exerciseName === name ? detail.award.exercises[index].points : null;

  return (
    <Sheet title="Workout details" onClose={onClose}>
      {error && <p className="auth-message" role="alert">{error}</p>}
      {!detail && !error && <p className="empty-message">Loading workout...</p>}
      {detail && (editing
        ? <WorkoutEditor detail={detail} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load(); onChanged(); }} />
        : (
          <div className="workout-view">
            <Label>{longDate(detail.workout.completedAt)}</Label>
            <div className="section-title">{detail.workout.name}</div>
            <div className="workout-facts">
              <span><Icon name={categoryIcon[detail.workout.category][0]} size={14} /> {detail.workout.category[0].toUpperCase() + detail.workout.category.slice(1)}</span>
              <span><Icon name="clock" size={14} /> {formatMinutes(detail.workout.durationMinutes)}</span>
              <span className="points-strong"><Icon name="bolt" size={14} /> {detail.workout.points === null ? "No points" : `${detail.workout.points.toLocaleString()} pts`}</span>
            </div>
            <div className="exercise-lines">
              {detail.exercises.length === 0 && <p className="empty-message">Saved without exercises, so it earned no points. Edit it to add what you did.</p>}
              {detail.exercises.map((exercise, index) => (
                <div key={`${index}-${exercise.name}`}>
                  <span><strong>{exercise.name}</strong><small>{exercise.tracking === "cardio" ? `${exercise.minutes} min · ${exercise.metricValue.toLocaleString()} ${limitsFor(exercise.name).metric?.unit ?? ""}` : `${exercise.sets} × ${exercise.reps}`}</small></span>
                  <b>{awardFor(exercise.name, index) ?? "—"} pts</b>
                </div>
              ))}
            </div>
            <div className="form-actions">
              {confirmDelete
                ? <><span className="danger-text">Delete this workout and its {detail.workout.points ?? 0} points?</span>
                    <Button className="secondary-button" onClick={() => setConfirmDelete(false)}>Keep</Button>
                    <Button className="primary-button danger-button" disabled={busy} onClick={remove}>{busy ? "Deleting..." : "Delete"}</Button></>
                : <><Button className="secondary-button" onClick={() => setConfirmDelete(true)}>Delete</Button>
                    <Button className="primary-button" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> Edit</Button></>}
            </div>
          </div>
        ))}
    </Sheet>
  );
}

export function WorkoutHistory({ onBack, onChanged, goLog }: { onBack: () => void; onChanged: () => void; goLog: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [filters, setFilters] = useState<{ start?: string; end?: string }>({});
  const [items, setItems] = useState<WorkoutHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.history({ ...filters })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.pagination.nextCursor);
      })
      .catch((failure) => active && setError(errorMessage(failure)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [filters, version]);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await api.history({ cursor });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.pagination.nextCursor);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (start && end && start > end) {
      setError("The start date must be on or before the end date.");
      return;
    }
    setFilters({ start: start || undefined, end: end || undefined });
  }

  const changed = () => {
    setVersion((value) => value + 1);
    onChanged();
  };
  const filtered = Boolean(filters.start || filters.end);
  const total = items.reduce((sum, item) => sum + (item.points ?? 0), 0);

  return (
    <div className="page">
      <div className="welcome-row">
        <PageTitle subtitle="Every workout you've saved. Tap one to see details, edit it, or delete it.">Workout history</PageTitle>
        <Button className="secondary-button back-button" onClick={onBack}><Icon name="arrow" size={15} /> Back</Button>
      </div>
      <Card className="history-card">
        <form className="history-filters" onSubmit={apply}>
          <label><span>From</span><input type="date" value={start} max={end || localDate()} onChange={(e) => setStart(e.target.value)} /></label>
          <label><span>To</span><input type="date" value={end} min={start || undefined} max={localDate()} onChange={(e) => setEnd(e.target.value)} /></label>
          <Button type="submit" className="primary-button">Apply</Button>
          {filtered && <Button className="mini-text-button" onClick={() => { setStart(""); setEnd(""); setFilters({}); }}>Clear</Button>}
        </form>
        {error && <p className="auth-message" role="alert">{error}</p>}
        {!loading && items.length === 0 && !error && (
          <p className="empty-message">{filtered ? "No workouts in those dates." : <>No workouts yet. <Button className="text-button" onClick={goLog}>Log your first one</Button></>}</p>
        )}
        <div className="activity-list history-list">
          {items.map((item) => (
            <button type="button" className="activity-row history-row" key={item.id} onClick={() => setOpenId(item.id)}>
              <div className={`activity-icon ${categoryIcon[item.category][1]}`}><Icon name={categoryIcon[item.category][0]} /></div>
              <div className="activity-copy"><strong>{item.name}</strong><span>{longDate(item.completedAt)} · {formatMinutes(item.durationMinutes)}</span></div>
              <div className="activity-points">{item.points === null ? "—" : `+${item.points.toLocaleString()} pts`}</div>
              <Icon name="chevron" size={15} />
            </button>
          ))}
        </div>
        {items.length > 0 && <p className="board-note">Showing {items.length} {items.length === 1 ? "workout" : "workouts"} · {total.toLocaleString()} pts{cursor ? " so far" : ""}</p>}
        {cursor && <Button className="secondary-button load-more" disabled={loading} onClick={loadMore}>{loading ? "Loading..." : "Load more"}</Button>}
        {loading && items.length === 0 && <p className="empty-message">Loading history...</p>}
      </Card>
      {openId && <WorkoutSheet id={openId} onClose={() => setOpenId(null)} onChanged={changed} />}
    </div>
  );
}
