import React from 'react';
import { Card } from '../ui/Card';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useProfile } from '../../contexts/ProfileContext';
import { WeightUnit, formatWeight } from '../../utils/units';

/**
 * Display unit for weights.
 *
 * Onboarding already asked this question and then discarded the answer — it
 * lived in component state, so someone who entered pounds read kilograms for
 * the rest of the app's life. The preference is now on the profile, and this
 * is where it can be changed afterwards.
 *
 * It sits in the profile sheet rather than beside a weight field because it is
 * a durable, set-once preference, not a per-screen control. Repeating it next
 * to each input would make one global setting look like three local ones.
 */
export const UnitPreference: React.FC = () => {
  const { profile, setWeightUnit } = useProfile();
  const unit: WeightUnit = profile.weightUnit ?? 'kg';

  return (
    <Card
      title="Units"
      description="Changes how weights are shown and entered. Nothing you have logged is altered — only how it reads."
    >
      <SegmentedControl<WeightUnit>
        label="Weight unit"
        value={unit}
        onChange={setWeightUnit}
        segments={[
          { value: 'kg', label: 'Kilograms', ariaLabel: 'Show weights in kilograms' },
          { value: 'lbs', label: 'Pounds', ariaLabel: 'Show weights in pounds' },
        ]}
      />
      <p className="nums text-xs text-fg-mute mt-3">
        Your weight reads as <span className="font-semibold text-fg-soft">{formatWeight(profile.weightKg, unit)}</span>.
      </p>
    </Card>
  );
};
