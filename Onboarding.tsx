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

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-slate-800">Let's start with the basics</h2>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Age</label>
              <input 
                type="number" 
                value={profile.age || ''} 
                onChange={e => updateProfile('age', parseInt(e.target.value))}
                className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none text-lg"
                placeholder="Years"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Gender</label>
              <div className="flex gap-2">
                {[Gender.Male, Gender.Female, Gender.PreferNotToSay].map(g => (
                  <button
                    key={g}
                    onClick={() => updateProfile('gender', g)}
                    className={`flex-1 py-3 rounded-xl border-2 font-medium transition-colors ${
                      profile.gender === g 
                        ? 'border-brand-500 bg-brand-50 text-brand-700' 
                        : 'border-slate-200 hover:border-brand-300'
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
            <h2 className="text-2xl font-bold text-slate-800">Body Metrics</h2>
            
            {/* Height Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                 <label className="block text-sm font-semibold text-slate-600">Height</label>
                 <div className="flex bg-slate-100 rounded-lg p-1">
                    <button 
                      onClick={() => handleUnitChange('height', 'cm')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${heightUnit === 'cm' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}
                    >
                      CM
                    </button>
                    <button 
                      onClick={() => handleUnitChange('height', 'ft')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${heightUnit === 'ft' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}
                    >
                      FT
                    </button>
                 </div>
              </div>
              
              {heightUnit === 'cm' ? (
                <input 
                  type="number" 
                  value={profile.heightCm || ''} 
                  onChange={e => updateProfile('heightCm', parseInt(e.target.value))}
                  className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none text-lg"
                  placeholder="175"
                />
              ) : (
                <div className="flex gap-4">
                   <div className="flex-1">
                     <input 
                        type="number" 
                        value={feet} 
                        onChange={e => handleImperialHeightChange(e.target.value, inches)}
                        className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none text-lg"
                        placeholder="5"
                      />
                      <span className="text-xs text-slate-400 mt-1 ml-1">Feet</span>
                   </div>
                   <div className="flex-1">
                     <input 
                        type="number" 
                        value={inches} 
                        onChange={e => handleImperialHeightChange(feet, e.target.value)}
                        className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none text-lg"
                        placeholder="10"
                      />
                      <span className="text-xs text-slate-400 mt-1 ml-1">Inches</span>
                   </div>
                </div>
              )}
            </div>

            {/* Weight Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                 <label className="block text-sm font-semibold text-slate-600">Weight</label>
                 <div className="flex bg-slate-100 rounded-lg p-1">
                    <button 
                      onClick={() => handleUnitChange('weight', 'kg')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${weightUnit === 'kg' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}
                    >
                      KG
                    </button>
                    <button 
                      onClick={() => handleUnitChange('weight', 'lbs')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${weightUnit === 'lbs' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}
                    >
                      LBS
                    </button>
                 </div>
              </div>
              
              {weightUnit === 'kg' ? (
                <input 
                  type="number" 
                  value={profile.weightKg || ''} 
                  onChange={e => updateProfile('weightKg', parseFloat(e.target.value))}
                  className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none text-lg"
                  placeholder="70"
                />
              ) : (
                <input 
                  type="number" 
                  value={pounds} 
                  onChange={e => handlePoundsChange(e.target.value)}
                  className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none text-lg"
                  placeholder="150"
                />
              )}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-slate-800">Your Goals & Lifestyle</h2>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Main Goal</label>
              <select 
                value={profile.goal} 
                onChange={e => updateProfile('goal', e.target.value)}
                className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none bg-white"
              >
                {Object.values(Goal).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Activity Level</label>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">General Activity</label>
                        <select 
                            value={profile.activityLevel} 
                            onChange={e => updateProfile('activityLevel', e.target.value)}
                            className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none bg-white"
                        >
                            {Object.values(ActivityLevel).map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                            Approx. Daily Steps (Optional)
                            <span className="font-normal text-slate-400 ml-1">- Helps fine-tune accuracy</span>
                        </label>
                        <input 
                            type="number"
                            value={profile.dailySteps || ''} 
                            onChange={e => updateProfile('dailySteps', parseInt(e.target.value))}
                            className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none bg-white"
                            placeholder="e.g. 5000"
                        />
                    </div>
                </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Sleep (Avg Hours)</label>
               <input 
                type="number" 
                value={profile.sleepHours || ''} 
                onChange={e => updateProfile('sleepHours', parseInt(e.target.value))}
                className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none"
                placeholder="7"
              />
            </div>
          </div>
        );
      case 3:
        return (
           <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-slate-800">Final Safety Checks</h2>
            
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Dietary Restrictions</label>
              <div className="flex flex-wrap gap-2">
                {Object.values(DietaryRestriction).map(r => (
                  <button
                    key={r}
                    onClick={() => toggleRestriction(r)}
                    className={`px-4 py-2 rounded-full text-sm font-bold border-2 transition-colors ${
                      profile.dietaryRestrictions?.includes(r)
                        ? 'border-brand-500 bg-brand-100 text-brand-700'
                        : 'border-slate-200 text-slate-500 hover:border-brand-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                Medical Conditions / Medications
                <span className="block text-xs font-normal text-slate-400">Optional. Enter "None" if healthy. If you are pregnant or have a chronic condition, please list it here so we can keep recommendations safe.</span>
              </label>
              <textarea 
                value={profile.medicationsOrConditions || ''} 
                onChange={e => updateProfile('medicationsOrConditions', e.target.value)}
                className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:outline-none"
                placeholder="e.g. Type 2 Diabetes, Pregnant, taking Blood Thinners..."
                rows={3}
              />
            </div>
          </div>
        );
      default: return null;
    }
  };

  const isStepValid = () => {
    if (step === 0) return profile.age && profile.age > 0;
    if (step === 1) return profile.heightCm && profile.weightKg;
    if (step === 2) return profile.goal && profile.activityLevel && profile.sleepHours;
    return true;
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="flex gap-2 mb-8">
        {steps.map((_, i) => (
          <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${i <= step ? 'bg-brand-500' : 'bg-slate-200'}`} />
        ))}
      </div>

      <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 min-h-[400px] flex flex-col justify-between">
        {renderStep()}

        <div className="flex gap-4 mt-8 pt-6 border-t border-slate-100">
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