import React from 'react';
import { SupplementRecommendation, WellnessPlan } from '../types';
import {
  IconSparkles, IconRocket, IconSalad, IconPill, IconCheck, IconArrowUp,
  IconAlertTriangle, IconInfoCircle,
} from '@tabler/icons-react';

const SupplementCard: React.FC<{ supp: SupplementRecommendation }> = ({ supp }) => (
  <div className="bg-card border border-edge p-4 rounded-tile shadow-sm dark:shadow-none mb-3">
    <div className="flex justify-between items-start gap-2">
      <h4 className="font-bold text-lg text-fg">{supp.name}</h4>
      <span className={`text-xs px-2 py-1 rounded-full font-bold shrink-0 ${
        supp.priority === 'High' ? 'bg-nutri/10 text-nutri' : 'bg-raised text-fg-soft'
      }`}>
        {supp.priority} Priority
      </span>
    </div>
    <p className="text-sm text-fg-soft mt-1">{supp.reason}</p>
    {supp.caution && (
      <div className="mt-2 inline-flex items-start gap-1.5 text-xs text-fg-soft bg-spark/10 p-2 rounded-control">
        <IconAlertTriangle size={14} className="text-spark shrink-0 mt-0.5" />
        <span><strong className="text-spark">Note:</strong> {supp.caution}</span>
      </div>
    )}
  </div>
);

export const PlanDisplay: React.FC<{ plan: WellnessPlan }> = ({ plan }) => {
  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Honesty: never let an API failure read as personalised advice. */}
      {plan.isFallback && (
        <div className="bg-spark/10 border border-spark/30 rounded-card p-4 flex gap-3 items-start text-sm">
          <IconAlertTriangle size={20} className="text-spark shrink-0 mt-0.5" />
          <div>
            <strong className="text-fg block mb-1">Showing general guidance</strong>
            <span className="text-fg-soft">
              We couldn't reach the AI to build your personalised plan, so this is
              generic starter advice — it is not based on your profile. Use “Start
              Over” to try again.
            </span>
          </div>
        </div>
      )}

      {/* Summary Section */}
      <section className="rounded-modal p-8 text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}>
        <h2 className="text-2xl font-extrabold mb-4">Your Path Forward</h2>
        <p className="text-lg opacity-95 leading-relaxed font-medium">{plan.summary}</p>
      </section>

      {/* Strengths & Improvements */}
      <div className="grid md:grid-cols-2 gap-5">
        <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 mb-4">
             <IconSparkles size={22} className="text-nutri" />
             <h3 className="font-bold text-fg text-lg">What You're Doing Well</h3>
          </div>
          <ul className="space-y-3">
            {plan.currentStrengths?.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-fg-soft">
                <div className="w-5 h-5 rounded-full bg-nutri/15 text-nutri flex items-center justify-center shrink-0 mt-0.5"><IconCheck size={12} stroke={3} /></div>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 mb-4">
             <IconRocket size={22} className="text-spark" />
             <h3 className="font-bold text-fg text-lg">Areas for Improvement</h3>
          </div>
          <ul className="space-y-3">
            {plan.areasForImprovement?.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-fg-soft">
                <div className="w-5 h-5 rounded-full bg-spark/15 text-spark flex items-center justify-center shrink-0 mt-0.5"><IconArrowUp size={12} stroke={3} /></div>
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Nutrition First */}
        <section className="bg-raised rounded-card p-6 border border-edge">
          <div className="flex items-center gap-3 mb-4">
             <div className="w-10 h-10 bg-nutri/15 text-nutri rounded-full flex items-center justify-center"><IconSalad size={20} /></div>
             <h3 className="text-xl font-bold text-fg">Nutrition Strategy</h3>
          </div>
          <p className="text-fg-soft mb-6 font-medium">{plan.nutritionFocus}</p>

          {(plan.nutritionGaps?.length ?? 0) > 0 && (
            <div className="bg-card rounded-tile p-4 border border-edge">
              <h4 className="text-sm font-semibold text-fg-mute uppercase tracking-wider mb-2">Watch out for gaps</h4>
              <ul className="list-disc list-inside text-fg-soft space-y-1">
                {plan.nutritionGaps?.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Supplementation */}
        <section className="bg-raised rounded-card p-6 border border-edge">
           <div className="flex items-center gap-3 mb-4">
             <div className="w-10 h-10 bg-hydro/15 text-hydro rounded-full flex items-center justify-center"><IconPill size={20} /></div>
             <h3 className="text-xl font-bold text-fg">Safe Supplementation</h3>
          </div>
          <p className="text-xs text-fg-mute mb-4">
            Supplements are secondary to food. Only considered if evidence-based and safe for you.
          </p>
          {(plan.safeSupplements?.length ?? 0) === 0 ? (
             <div className="p-4 bg-nutri/10 text-fg rounded-tile text-center text-sm">
               {plan.isFallback
                 ? "No supplement guidance is available offline. Reconnect and start over for a personalised review, and talk to a clinician before starting anything new."
                 : "Great news! Based on your profile, you likely don't need any specific supplements right now. Focus on whole foods."}
             </div>
          ) : (
            <div>
              {plan.safeSupplements?.map((supp, i) => (
                <SupplementCard key={i} supp={supp} />
              ))}
            </div>
          )}
        </section>
      </div>

       {/* Safety Disclaimer Banner */}
       <div className="bg-raised border border-edge rounded-card p-6 text-fg-soft text-sm flex gap-4 items-start">
         <IconInfoCircle size={22} className="text-fg-mute shrink-0" />
         <div>
           <strong className="text-fg block mb-1">Important Safety Note</strong>
           {plan.safetyDisclaimer}
           <span className="text-fg-mute mt-2 block">Content generated by VitalQuest is for informational purposes only and does not constitute medical advice, diagnosis, or treatment.</span>
         </div>
       </div>

    </div>
  );
};
