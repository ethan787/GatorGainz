import { useState, type FormEvent } from "react";
import type { PrimaryGoal, ProfileResponse, ProfileVisibility, TrainingLevel } from "@gatorgainz/types";
import { api, errorMessage } from "./api";
import { goalLabels } from "./profile";
import { Button, Card, Icon, Label } from "./ui";

const levels: [TrainingLevel, string, string][] = [
  ["beginner", "Beginner", "New to training or coming back"],
  ["intermediate", "Intermediate", "Training regularly for a while"],
  ["advanced", "Advanced", "Years of structured training"],
];

/** Three short steps after sign-up. Saving or skipping both mark the welcome flow done. */
export function Onboarding({ data, onDone }: { data: ProfileResponse; onDone: (result: ProfileResponse) => void }) {
  const { profile } = data;
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(profile.fullName);
  const [handle, setHandle] = useState(profile.handle);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>(profile.primaryGoal);
  const [trainingLevel, setTrainingLevel] = useState<TrainingLevel>(profile.trainingLevel);
  const [weeklyGoal, setWeeklyGoal] = useState(profile.weeklyGoal);
  const [visibility, setVisibility] = useState<ProfileVisibility>(profile.visibility);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function finish(skip = false) {
    setSaving(true);
    setError("");
    try {
      const changes = skip
        ? { onboarded: true as const }
        : {
            onboarded: true as const,
            ...(fullName.trim() !== profile.fullName ? { fullName: fullName.trim() } : {}),
            ...(handle !== profile.handle ? { handle } : {}),
            primaryGoal,
            trainingLevel,
            weeklyGoal,
            visibility,
          };
      onDone(await api.updateProfile(changes));
    } catch (failure) {
      setError(errorMessage(failure));
      // A taken username sends the user back to the step where it can be fixed.
      if (/username/i.test(errorMessage(failure))) setStep(0);
    } finally {
      setSaving(false);
    }
  }

  function next(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (step === 0) {
      if (!fullName.trim()) return setError("Enter your name.");
      if (!/^[a-z0-9_]{3,24}$/.test(handle)) return setError("Usernames are 3–24 lowercase letters, numbers, or underscores.");
    }
    if (step < 2) setStep(step + 1);
    else void finish();
  }

  return (
    <div className="page onboarding-page">
      <Card className="onboarding-card">
        <div className="onboarding-steps" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((index) => <span key={index} className={index <= step ? "done" : ""} />)}
        </div>
        <form onSubmit={next} className="profile-form onboarding-form">
          {step === 0 && (
            <>
              <div className="wide">
                <Label>Welcome to GatorGainz</Label>
                <div className="section-title">How should people know you?</div>
                <p className="muted">Your name and username appear on the leaderboard and when people search for you.</p>
              </div>
              <label className="wide"><span>Name</span><input value={fullName} maxLength={80} required autoFocus onChange={(e) => setFullName(e.target.value)} /></label>
              <label className="wide">
                <span>Username</span>
                <div className="handle-input"><b>@</b><input value={handle} maxLength={24} required onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} /></div>
                <small>We picked one from your name. Change it now or any time later.</small>
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <div className="wide">
                <Label>Your goals</Label>
                <div className="section-title">What are you training for?</div>
              </div>
              <div className="wide choice-grid">
                {Object.entries(goalLabels).map(([value, label]) => (
                  <button type="button" key={value} className={`choice ${primaryGoal === value ? "active" : ""}`} onClick={() => setPrimaryGoal(value as PrimaryGoal)}>{label}</button>
                ))}
              </div>
              <div className="wide choice-list">
                {levels.map(([value, label, detail]) => (
                  <button type="button" key={value} className={`choice ${trainingLevel === value ? "active" : ""}`} onClick={() => setTrainingLevel(value)}>
                    <strong>{label}</strong><small>{detail}</small>
                  </button>
                ))}
              </div>
              <label className="wide">
                <span>Workouts per week</span>
                <div className="goal-picker">
                  <Button className="icon-button" label="Fewer" disabled={weeklyGoal <= 1} onClick={() => setWeeklyGoal(weeklyGoal - 1)}>−</Button>
                  <strong>{weeklyGoal}</strong>
                  <Button className="icon-button" label="More" disabled={weeklyGoal >= 14} onClick={() => setWeeklyGoal(weeklyGoal + 1)}>+</Button>
                </div>
                <small>Your dashboard tracks this over the last 7 days.</small>
              </label>
            </>
          )}
          {step === 2 && (
            <>
              <div className="wide">
                <Label>Privacy</Label>
                <div className="section-title">Who can find you?</div>
                <p className="muted">Either way, other people only see your name, username, level, and points. You can change this later on the Account page.</p>
              </div>
              <fieldset className="wide visibility-options">
                <legend className="sr-only">Visibility</legend>
                {(["public", "private"] as ProfileVisibility[]).map((value) => (
                  <label key={value} className={visibility === value ? "active" : ""}>
                    <input type="radio" name="onboarding-visibility" checked={visibility === value} onChange={() => setVisibility(value)} />
                    <span><strong>{value === "public" ? "Public" : "Private"}</strong>
                      <small>{value === "public"
                        ? "People can search for you and see you on the leaderboard."
                        : "Hidden from search and the global leaderboard. Friends connect through your invite link."}</small></span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {error && <div className="auth-message wide" role="alert">{error}</div>}
          <div className="form-actions wide onboarding-actions">
            <Button className="mini-text-button" disabled={saving} onClick={() => finish(true)}>Skip for now</Button>
            <span />
            {step > 0 && <Button className="secondary-button" onClick={() => { setError(""); setStep(step - 1); }}>Back</Button>}
            <Button type="submit" className="primary-button" disabled={saving}>
              {step < 2 ? <>Next <Icon name="arrow" size={15} /></> : saving ? "Saving..." : "Start training"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
