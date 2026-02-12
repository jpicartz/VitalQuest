import React from 'react';
import { SupplementRecommendation, WellnessPlan, Habit } from '../types';

interface PlanDisplayProps {
  plan: WellnessPlan;
}

const SupplementCard: React.FC<{ supp: SupplementRecommendation }> = ({ supp }) => (
  <div className="bg-white border-l-4 border-brand-500 p-4 rounded-r-xl shadow-sm mb-3">
    <div className="flex justify-between items-start">
      <h4 className="font-bold text-lg text-slate-800">{supp.name}</h4>
      <span className={`text-xs px-2 py-1 rounded-full font-bold ${
        supp.priority === 'High' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'
      }`}>
        {supp.priority} Priority
      </span>
    </div>
    <p className="text-sm text-slate-600 mt-1">{supp.reason}</p>
    {supp.caution && (
      <div className="mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
        <strong>⚠️ Note:</strong> {supp.caution}
      </div>
    )}
  </div>
);

export const PlanDisplay: React.FC<PlanDisplayProps> = ({ plan }) => {
  return (
    <div className="space-y-8 animate-fade-in-up">
      
      {/* Summary Section */}
      <section className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-3xl p-8 text-white shadow-lg">
        <h2 className="text-2xl font-extrabold mb-4">Your Path Forward</h2>
        <p className="text-lg opacity-95 leading-relaxed font-medium">{plan.summary}</p>
      </section>

      {/* Strengths & Improvements */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
             <span className="text-2xl">🌟</span>
             <h3 className="font-bold text-slate-800 text-lg">What You're Doing Well</h3>
          </div>
          <ul className="space-y-3">
            {plan.currentStrengths?.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-slate-600">
                <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs mt-0.5">✓</div>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
             <span className="text-2xl">🚀</span>
             <h3 className="font-bold text-slate-800 text-lg">Areas for Improvement</h3>
          </div>
          <ul className="space-y-3">
            {plan.areasForImprovement?.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-slate-600">
                <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs mt-0.5">↑</div>
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Nutrition First */}
        <section className="bg-slate-50 rounded-3xl p-6 border-2 border-slate-100">
          <div className="flex items-center gap-3 mb-4">
             <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-xl">🥗</div>
             <h3 className="text-xl font-bold text-slate-800">Nutrition Strategy</h3>
          </div>
          <p className="text-slate-700 mb-6 font-medium">{plan.nutritionFocus}</p>
          
          {plan.nutritionGaps.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Watch Out For Gaps</h4>
              <ul className="list-disc list-inside text-slate-700 space-y-1">
                {plan.nutritionGaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Supplementation */}
        <section className="bg-slate-50 rounded-3xl p-6 border-2 border-slate-100">
           <div className="flex items-center gap-3 mb-4">
             <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-xl">💊</div>
             <h3 className="text-xl font-bold text-slate-800">Safe Supplementation</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Supplements are secondary to food. Only considered if evidence-based and safe for you.
          </p>
          {plan.safeSupplements.length === 0 ? (
             <div className="p-4 bg-green-50 text-green-800 rounded-xl text-center">
               Great news! Based on your profile, you likely don't need any specific supplements right now. Focus on whole foods.
             </div>
          ) : (
            <div>
              {plan.safeSupplements.map((supp, i) => (
                <SupplementCard key={i} supp={supp} />
              ))}
            </div>
          )}
        </section>
      </div>

       {/* Safety Disclaimer Banner */}
       <div className="bg-slate-900 rounded-2xl p-6 text-slate-300 text-sm flex gap-4 items-start">
         <span className="text-2xl">⚖️</span>
         <div>
           <strong className="text-white block mb-1">Important Safety Note</strong>
           {plan.safetyDisclaimer}
           <br/>
           <span className="opacity-70 mt-2 block">Content generated by VitalQuest is for informational purposes only and does not constitute medical advice, diagnosis, or treatment.</span>
         </div>
       </div>

    </div>
  );
};