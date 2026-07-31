import React, { useState } from 'react';
import { ActivityLevel, DietaryRestriction, Gender, Goal, UserProfile } from '../types';
import { Button } from './ui/Button';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
  isLoading: boolean;
}

const steps = [
  'Basics',
  'Body',
  'Lifestyle',
  'Medical'
];

const inputClass = "w-full p-4 rounded-control bg-card border-2 border-edge text-fg placeholder:text-fg-mute focus:border-nutri focus:outline-none text-lg";

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, isLoading }) => {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    dietaryRestrictions: [],
    gender: Gender.PreferNotToSay,
    activityLevel: ActivityLevel.Sedentary,
    goal: Goal.GeneralHealth,
    dailySteps: undefined
  });

  // Unit State
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');

  // Local state for imperial inputs to ensure smooth typing without rounding jitter
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [pounds, setPounds] = useState('');

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete(profile as UserProfile);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const updateProfile = (key: keyof UserProfile, value: any) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  };

  const toggleRestriction = (r: DietaryRestriction) => {
    const current = profile.dietaryRestrictions || [];
    if (current.includes(r)) {
      updateProfile('dietaryRestrictions', current.filter(i => i !== r));
    } else {
      updateProfile('dietaryRestrictions', [...current, r]);
    }
  };

  // Imperial Handlers
  const handleImperialHeightChange = (f: string, i: string) => {
    setFeet(f);
    setInches(i);
    const ftVal = parseInt(f) || 0;
    const inVal = parseInt(i) || 0;
    if (ftVal > 0 || inVal > 0) {
      const totalInches = (ftVal * 12) + inVal;
      const cm = Math.round(totalInches * 2.54);
      updateProfile('heightCm', cm);
    } else {
        updateProfile('heightCm', undefined);
    }
  };

  const handlePoundsChange = (val: string) => {
    setPounds(val);
    const lbs = parseFloat(val);
    if (!isNaN(lbs)) {
       const kg = lbs * 0.453592;
       updateProfile('weightKg', parseFloat(kg.toFixed(1)));
    } else {
        updateProfile('weightKg', undefined);
    }
  };

  const handleUnitChange = (type: 'height' | 'weight', unit: string) => {
      if (type === 'height') {
          const newUnit = unit as 'cm' | 'ft';
          setHeightUnit(newUnit);
          // Convert existing value to populate inputs
          if (profile.heightCm && newUnit === 'ft') {
             const totalIn = profile.heightCm / 2.54;
             setFeet(Math.floor(totalIn / 12).toString());
             setInches(Math.round(totalIn % 12).toString());
          }
      } else {
          const newUnit = unit as 'kg' | 'lbs';
          setWeightUnit(newUnit);
          if (profile.weightKg && newUnit === 'lbs') {
              setPounds(Math.round(profile.weightKg * 2.20462).toString());
          }
      }
  };

  const unitBtn = (active: boolean) =>
    `px-3 py-1 text-xs font-bold rounded-md transition-all ${active ? 'bg-card shadow-sm dark:shadow-none text-fg' : 'text-fg-mute'}`;

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-fg">Let's start with the basics</h2>
            <div>
              <label htmlFor="onboarding-age" className="block text-sm font-semibold text-fg-soft mb-2">Age</label>
              <input
                id="onboarding-age"
                type="number"
                inputMode="numeric"
                min={LIMITS.age.min}
                max={LIMITS.age.max}
                value={profile.age || ''}
                onChange={e => updateProfile('age', parseInt(e.target.value))}
                className={inputClass}
                placeholder="Years"
              />
            </div>
            <div role="group" aria-labelledby="onboarding-gender-label">
              <span id="onboarding-gender-label" className="block text-sm font-semibold text-fg-soft mb-2">Gender</span>
              <div className="flex gap-2">
                {[Gender.Male, Gender.Female, Gender.PreferNotToSay].map(g => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={profile.gender === g}
                    onClick={() => updateProfile('gender', g)}
                    className={`flex-1 py-3 rounded-control border-2 font-medium transition-colors ${
                      profile.gender === g
                        ? 'border-nutri bg-nutri/10 text-nutri'
                        : 'border-edge text-fg hover:border-nutri/50'
                    }`}
                  >
                    {g === Gender.PreferNotToSay ? 'Other' : g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-fg">Body Metrics</h2>

            {/* Height Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                 <label htmlFor="onboarding-height" className="block text-sm font-semibold text-fg-soft">Height</label>
                 <div className="flex bg-raised rounded-lg p-1">
                    <button type="button" aria-pressed={heightUnit === 'cm'} onClick={() => handleUnitChange('height', 'cm')} className={unitBtn(heightUnit === 'cm')}>CM</button>
                    <button type="button" aria-pressed={heightUnit === 'ft'} onClick={() => handleUnitChange('height', 'ft')} className={unitBtn(heightUnit === 'ft')}>FT</button>
                 </div>
              </div>

              {heightUnit === 'cm' ? (
                <input
                  id="onboarding-height"
                  type="number"
                  inputMode="numeric"
                  min={LIMITS.heightCm.min}
                  max={LIMITS.heightCm.max}
                  value={profile.heightCm || ''}
                  onChange={e => updateProfile('heightCm', parseInt(e.target.value))}
                  className={inputClass}
                  placeholder="175"
                />
              ) : (
                <div className="flex gap-4">
                   <div className="flex-1">
                     <input
                        id="onboarding-height"
                        type="number"
                        inputMode="numeric"
                        min={3}
                        max={8}
                        value={feet}
                        onChange={e => handleImperialHeightChange(e.target.value, inches)}
                        className={inputClass}
                        placeholder="5"
                        aria-label="Height in feet"
                      />
                      <span className="text-xs text-fg-mute mt-1 ml-1">Feet</span>
                   </div>
                   <div className="flex-1">
                     <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={11}
                        value={inches}
                        onChange={e => handleImperialHeightChange(feet, e.target.value)}
                        className={inputClass}
                        placeholder="10"
                        aria-label="Height in inches"
                      />
                      <span className="text-xs text-fg-mute mt-1 ml-1">Inches</span>
                   </div>
                </div>
              )}
            </div>

            {/* Weight Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                 <label htmlFor="onboarding-weight" className="block text-sm font-semibold text-fg-soft">Weight</label>
                 <div className="flex bg-raised rounded-lg p-1">
                    <button type="button" aria-pressed={weightUnit === 'kg'} onClick={() => handleUnitChange('weight', 'kg')} className={unitBtn(weightUnit === 'kg')}>KG</button>
                    <button type="button" aria-pressed={weightUnit === 'lbs'} onClick={() => handleUnitChange('weight', 'lbs')} className={unitBtn(weightUnit === 'lbs')}>LBS</button>
                 </div>
              </div>

              {weightUnit === 'kg' ? (
                <input
                  id="onboarding-weight"
                  type="number"
                  inputMode="decimal"
                  min={LIMITS.weightKg.min}
                  max={LIMITS.weightKg.max}
                  value={profile.weightKg || ''}
                  onChange={e => updateProfile('weightKg', parseFloat(e.target.value))}
                  className={inputClass}
                  placeholder="70"
                />
              ) : (
                <input
                  id="onboarding-weight"
                  type="number"
                  inputMode="decimal"
                  min={66}
                  max={660}
                  value={pounds}
                  onChange={e => handlePoundsChange(e.target.value)}
                  className={inputClass}
                  placeholder="150"
                />
              )}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-fg">Your Goals & Lifestyle</h2>
            <div>
              <label htmlFor="onboarding-goal" className="block text-sm font-semibold text-fg-soft mb-2">Main Goal</label>
              <select
                id="onboarding-goal"
                value={profile.goal}
                onChange={e => updateProfile('goal', e.target.value)}
                className={`${inputClass} bg-card`}
              >
                {Object.values(Goal).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="bg-raised p-4 rounded-card border border-edge">
                <span className="block text-sm font-bold text-fg mb-4 uppercase tracking-wider">Activity Level</span>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="onboarding-activity" className="block text-xs font-semibold text-fg-soft mb-1">General Activity</label>
                        <select
                            id="onboarding-activity"
                            value={profile.activityLevel}
                            onChange={e => updateProfile('activityLevel', e.target.value)}
                            className={`${inputClass} bg-card`}
                        >
                            {Object.values(ActivityLevel).map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="onboarding-steps" className="block text-xs font-semibold text-fg-soft mb-1">
                            Approx. Daily Steps (Optional)
                            <span className="font-normal text-fg-mute ml-1">- Helps fine-tune accuracy</span>
                        </label>
                        <input
                            id="onboarding-steps"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={50000}
                            value={profile.dailySteps || ''}
                            onChange={e => updateProfile('dailySteps', parseInt(e.target.value))}
                            className={`${inputClass} bg-card`}
                            placeholder="e.g. 5000"
                        />
                    </div>
                </div>
            </div>

            <div>
              <label htmlFor="onboarding-sleep" className="block text-sm font-semibold text-fg-soft mb-2">Sleep (Avg Hours)</label>
               <input
                id="onboarding-sleep"
                type="number"
                inputMode="numeric"
                min={LIMITS.sleepHours.min}
                max={LIMITS.sleepHours.max}
                value={profile.sleepHours || ''}
                onChange={e => updateProfile('sleepHours', parseInt(e.target.value))}
                className={inputClass}
                placeholder="7"
              />
            </div>
          </div>
        );
      case 3:
        return (
           <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-fg">Final Safety Checks</h2>

            <div role="group" aria-labelledby="onboarding-restrictions-label">
              <span id="onboarding-restrictions-label" className="block text-sm font-semibold text-fg-soft mb-2">Dietary Restrictions</span>
              <div className="flex flex-wrap gap-2">
                {Object.values(DietaryRestriction).map(r => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={profile.dietaryRestrictions?.includes(r) ?? false}
                    onClick={() => toggleRestriction(r)}
                    className={`px-4 py-2 rounded-full text-sm font-bold border-2 transition-colors ${
                      profile.dietaryRestrictions?.includes(r)
                        ? 'border-nutri bg-nutri/10 text-nutri'
                        : 'border-edge text-fg-soft hover:border-nutri/50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="onboarding-medical" className="block text-sm font-semibold text-fg-soft mb-2">
                Medical Conditions / Medications
                <span className="block text-xs font-normal text-fg-mute">Optional. Enter "None" if healthy. If you are pregnant or have a chronic condition, list it here — it is sent to the AI so it can screen suggestions against it.</span>
              </label>
              <textarea
                id="onboarding-medical"
                value={profile.medicationsOrConditions || ''}
                onChange={e => updateProfile('medicationsOrConditions', e.target.value)}
                className={`${inputClass} text-base`}
                placeholder="e.g. Type 2 Diabetes, Pregnant, taking Blood Thinners..."
                rows={3}
              />
            </div>

            {/* Shown before the user ever sees generated advice, not after. */}
            <div className="bg-raised border border-edge rounded-card p-4 text-xs text-fg-soft leading-relaxed">
              <strong className="text-fg block mb-1">Before you continue</strong>
              VitalQuest gives general wellness information generated by AI. It is
              not medical advice, diagnosis, or treatment, and it can be wrong —
              talk to a qualified healthcare professional before changing your diet,
              starting a supplement, or altering any medication. Your answers are
              stored in this browser and sent to Anthropic's API to generate your plan.
            </div>
          </div>
        );
      default: return null;
    }
  };

  // Plausible-human bounds. Without an upper/lower bound a negative or absurd
  // value flows straight into the BMR/TDEE/macro math and renders as negative
  // calorie and water targets across the app.
  const LIMITS = {
    age: { min: 13, max: 100 },
    heightCm: { min: 100, max: 250 },
    weightKg: { min: 30, max: 300 },
    sleepHours: { min: 3, max: 14 },
  } as const;

  const inRange = (v: number | undefined, k: keyof typeof LIMITS) =>
    typeof v === 'number' && Number.isFinite(v) && v >= LIMITS[k].min && v <= LIMITS[k].max;

  const stepError = (): string | null => {
    if (step === 0 && profile.age !== undefined && !inRange(profile.age, 'age')) {
      return `Please enter an age between ${LIMITS.age.min} and ${LIMITS.age.max}.`;
    }
    if (step === 1) {
      if (profile.heightCm !== undefined && !inRange(profile.heightCm, 'heightCm')) {
        return `Please enter a height between ${LIMITS.heightCm.min} and ${LIMITS.heightCm.max} cm.`;
      }
      if (profile.weightKg !== undefined && !inRange(profile.weightKg, 'weightKg')) {
        return `Please enter a weight between ${LIMITS.weightKg.min} and ${LIMITS.weightKg.max} kg.`;
      }
    }
    if (step === 2 && profile.sleepHours !== undefined && !inRange(profile.sleepHours, 'sleepHours')) {
      return `Please enter sleep between ${LIMITS.sleepHours.min} and ${LIMITS.sleepHours.max} hours.`;
    }
    return null;
  };

  const isStepValid = () => {
    if (step === 0) return inRange(profile.age, 'age');
    if (step === 1) return inRange(profile.heightCm, 'heightCm') && inRange(profile.weightKg, 'weightKg');
    if (step === 2) return !!profile.goal && !!profile.activityLevel && inRange(profile.sleepHours, 'sleepHours');
    return true;
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="flex gap-2 mb-8">
        {steps.map((_, i) => (
          <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${i <= step ? 'bg-nutri' : 'bg-track'}`} />
        ))}
      </div>

      <div className="bg-card rounded-modal p-8 shadow-xl dark:shadow-none border border-edge min-h-[400px] flex flex-col justify-between">
        {renderStep()}

        {stepError() && (
          <p role="alert" className="mt-6 text-sm text-fat">{stepError()}</p>
        )}

        <div className="flex gap-4 mt-8 pt-6 border-t border-edge">
          {step > 0 && (
            <Button variant="ghost" onClick={handleBack} disabled={isLoading}>
              Back
            </Button>
          )}
          <Button
            fullWidth
            onClick={handleNext}
            disabled={!isStepValid() || isLoading}
            variant="primary"
          >
            {isLoading ? 'Generating Plan...' : step === steps.length - 1 ? 'Create My Plan' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
};
