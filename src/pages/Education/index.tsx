import { useState, useEffect, useRef } from 'react'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { DIVISIONS } from '../../data/posing'
import {
  PEAK_WEEK_PROTOCOL,
  FIRST_TIMER_CHECKLIST,
  STAGE_READINESS_CHECKLIST,
  buildPrepTimeline,
} from '../../data/competitionPrep'
import { getShowCountdown } from '../../utils/dates'

type Tab = 'posing' | 'prep' | 'peakweek' | 'firsttimer' | 'timeline'

export default function Education() {
  const { user, shows } = useUserStore()
  const { settings } = useSettingsStore()
  const today2 = new Date().toLocaleDateString('en-CA')
  const hasUpcomingShow = shows.some(s => s.show_date >= today2)
  const [tab, setTab] = useState<Tab>(hasUpcomingShow ? 'timeline' : 'posing')
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(() => {
    if (user?.division) {
      const match = DIVISIONS.find((d) =>
        d.name.toLowerCase().includes(user.division!.toLowerCase().split(' ')[0])
      )
      if (match) return match.id
    }
    return DIVISIONS[0].id
  })
  const [expandedPose, setExpandedPose] = useState<string | null>(null)
  const [expandedChecklist, setExpandedChecklist] = useState<string | null>(null)
  const [stageCheckDone, setStageCheckDone] = useState<Set<string>>(new Set())
  const [carbWeight, setCarbWeight] = useState('')

  const division = DIVISIONS.find((d) => d.id === selectedDivisionId) ?? DIVISIONS[0]
  const isImperial = settings.units === 'imperial'

  function openTutorial(query: string) {
    window.api.openExternal(
      'https://www.youtube.com/results?search_query=' + encodeURIComponent(query)
    )
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'timeline', label: 'Prep Timeline' },
    { id: 'posing', label: 'Posing Guide' },
    { id: 'prep', label: 'Show Checklist' },
    { id: 'peakweek', label: 'Peak Week' },
    { id: 'firsttimer', label: 'First Timer' },
  ]

  const PHASE_COLORS: Record<string, string> = {
    green:  'bg-green-900/30 text-green-400 border-green-800/50',
    brand:  'bg-brand-900/30 text-brand-400 border-brand-800/50',
    blue:   'bg-blue-900/30 text-blue-400 border-blue-800/50',
    yellow: 'bg-yellow-900/20 text-yellow-400 border-yellow-800/50',
    orange: 'bg-orange-900/20 text-orange-400 border-orange-800/50',
    red:    'bg-red-900/20 text-red-400 border-red-800/50',
  }

  const today = new Date().toLocaleDateString('en-CA')
  const upcomingShows = shows
    .filter(s => s.show_date >= today)
    .sort((a, b) => a.show_date.localeCompare(b.show_date))
  const nearestShow = upcomingShows[0] ?? null

  const timeline = nearestShow ? buildPrepTimeline(nearestShow.show_date) : null
  const showCountdown = nearestShow ? getShowCountdown(nearestShow.show_date) : null

  const [expandedWeek, setExpandedWeek] = useState<number | null>(null)
  const expandedWeekInitialized = useRef(false)

  // Auto-expand the current week once the show data loads (shows load async from DB)
  useEffect(() => {
    if (expandedWeekInitialized.current || !timeline) return
    const currentWeek = timeline.find(w => w.isCurrentWeek)
    if (currentWeek) {
      setExpandedWeek(currentWeek.weeksOut)
      expandedWeekInitialized.current = true
    }
  }, [timeline])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Education & Competition Prep</h1>
        <p className="text-gray-500 mt-0.5 text-sm">
          IFBB/NPC division guides, posing tutorials, and peak week protocols
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── PREP TIMELINE ─── */}
      {tab === 'timeline' && (
        <div className="space-y-4">
          {!nearestShow ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-3">
              <p className="text-gray-300 font-semibold">No upcoming shows</p>
              <p className="text-gray-500 text-sm">Add a competition in Settings → My Shows to unlock your personalised prep timeline.</p>
            </div>
          ) : (
            <>
              {/* Show countdown header — nearest show */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      Next Show {upcomingShows.length > 1 ? `(1 of ${upcomingShows.length})` : ''}
                    </p>
                    <p className="text-base font-bold text-gray-100">
                      {nearestShow.name !== 'Competition' ? nearestShow.name + ' — ' : ''}
                      {new Date(nearestShow.show_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                    {nearestShow.division && <p className="text-xs text-gray-500 mt-0.5">{nearestShow.division}{nearestShow.federation ? ` · ${nearestShow.federation}` : ''}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Countdown</p>
                    {showCountdown && showCountdown.totalDays > 0 ? (
                      <>
                        <p className="text-2xl font-black text-brand-400">
                          {showCountdown.weeks > 0 ? `${showCountdown.weeks}w` : ''}{showCountdown.days > 0 ? ` ${showCountdown.days}d` : ''}
                        </p>
                        <p className="text-xs text-gray-500">{showCountdown.totalDays} days out</p>
                      </>
                    ) : (
                      <p className="text-xl font-black text-red-400">Show Day!</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { color: 'green', label: 'Off-Season' },
                  { color: 'brand', label: 'Hypertrophy' },
                  { color: 'blue', label: 'Strength' },
                  { color: 'yellow', label: 'Transition' },
                  { color: 'orange', label: 'Peak / Conditioning' },
                  { color: 'red', label: 'Peak Week' },
                ].map(({ color, label }) => (
                  <span key={color} className={`px-2 py-0.5 rounded-full border text-xs ${PHASE_COLORS[color]}`}>{label}</span>
                ))}
              </div>

              {/* Timeline cards */}
              <div className="space-y-2">
                {(timeline ?? []).map(({ weeksOut, isCurrentWeek, isPast, guidance }) => {
                  const isExpanded = expandedWeek === weeksOut
                  const weekLabel = weeksOut === 0 ? 'Peak Week' : `${weeksOut} week${weeksOut !== 1 ? 's' : ''} out`
                  return (
                    <div
                      key={weeksOut}
                      className={`border rounded-xl overflow-hidden transition-all ${
                        isCurrentWeek
                          ? 'border-brand-500 bg-brand-950/20'
                          : isPast
                            ? 'border-gray-800 opacity-50'
                            : 'border-gray-800 bg-gray-900'
                      }`}
                    >
                      {/* Card header — always visible */}
                      <button
                        onClick={() => setExpandedWeek(isExpanded ? null : weeksOut)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex-shrink-0">
                            {isCurrentWeek && (
                              <span className="text-xs bg-brand-600 text-white px-2 py-0.5 rounded-full font-semibold">NOW</span>
                            )}
                            {isPast && (
                              <span className="text-xs text-gray-600">Past</span>
                            )}
                            {!isCurrentWeek && !isPast && (
                              <span className="text-xs text-gray-500">Upcoming</span>
                            )}
                          </div>
                          <p className={`text-sm font-semibold ${isCurrentWeek ? 'text-brand-300' : 'text-gray-200'}`}>
                            {weekLabel}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${PHASE_COLORS[guidance.phaseColor]}`}>
                            {guidance.phase}
                          </span>
                        </div>
                        <span className="text-gray-600 text-xs ml-2 flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-4 border-t border-gray-800">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                            {/* Training */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Training</p>
                              <ul className="space-y-1">
                                {guidance.training.map((t, i) => (
                                  <li key={i} className="flex gap-2 text-xs text-gray-300">
                                    <span className="text-brand-500 flex-shrink-0 mt-0.5">›</span>{t}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            {/* Nutrition */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nutrition</p>
                              <ul className="space-y-1">
                                {guidance.nutrition.map((n, i) => (
                                  <li key={i} className="flex gap-2 text-xs text-gray-300">
                                    <span className="text-green-500 flex-shrink-0 mt-0.5">›</span>{n}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                          {/* Cardio + Focus */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-gray-800/50 rounded-lg p-3">
                              <p className="text-xs font-semibold text-blue-400 mb-1">Cardio</p>
                              <p className="text-xs text-gray-300">{guidance.cardio}</p>
                            </div>
                            <div className="bg-gray-800/50 rounded-lg p-3">
                              <p className="text-xs font-semibold text-yellow-400 mb-1">Focus</p>
                              <p className="text-xs text-gray-300">{guidance.focus}</p>
                            </div>
                          </div>
                          {/* Milestones */}
                          {guidance.milestones.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Milestones / Checklist</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                                {guidance.milestones.map((m, i) => (
                                  <div key={i} className="flex gap-2 text-xs text-gray-400 bg-gray-800/30 rounded-lg px-3 py-2">
                                    <span className="text-gray-600 flex-shrink-0">□</span>{m}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Multi-show transition blocks */}
              {upcomingShows.length > 1 && upcomingShows.slice(1).map((nextShow, idx) => {
                const prevShow = upcomingShows[idx]
                const prevCountdown = getShowCountdown(prevShow.show_date)
                const nextCountdown = getShowCountdown(nextShow.show_date)
                const weeksBetween = Math.floor(
                  (new Date(nextShow.show_date + 'T12:00:00').getTime() -
                   new Date(prevShow.show_date + 'T12:00:00').getTime()) /
                  (1000 * 60 * 60 * 24 * 7)
                )

                let bridgeLabel = ''
                let bridgeGuidance: string[] = []
                if (weeksBetween <= 3) {
                  bridgeLabel = 'Back-to-Back Shows'
                  bridgeGuidance = [
                    'Maintain peak conditioning — no diet break',
                    'Reduce training volume to avoid fatigue accumulation',
                    'Stay on peak week sodium/water protocol between shows',
                    'Light pump sessions only — no heavy lifting',
                    'Prioritise sleep, posing practice, and mental recovery',
                  ]
                } else if (weeksBetween <= 8) {
                  bridgeLabel = 'Short Turnaround'
                  bridgeGuidance = [
                    'Week 1–2: Mini recovery — add 200–300 kcal, reduce cardio by half',
                    'Reintroduce moderate training intensity — no heavy maxes yet',
                    'Weeks 3+: Mini prep begins — tighten diet, resume full cardio',
                    'Posing practice continues daily throughout the bridge',
                    'No significant weight gain — stay within 3–5 lbs of stage weight',
                  ]
                } else if (weeksBetween <= 16) {
                  bridgeLabel = 'Mid-Cycle Turnaround'
                  bridgeGuidance = [
                    'Weeks 1–3: Structured diet break — maintenance calories, reduce cardio',
                    'Weeks 4–6: Transition training block — moderate volume, rebuild strength',
                    'Weeks 7+: Begin dedicated mini-prep for Show 2',
                    'Allow 4–6 lbs of weight gain during recovery — mostly glycogen and water',
                    'Use extra time to address any weaknesses spotted at Show 1',
                  ]
                } else {
                  bridgeLabel = 'Full Offseason Block'
                  bridgeGuidance = [
                    'Full recovery period — eat at maintenance or slight surplus for 4–6 weeks',
                    'Rebuild training intensity and volume for hypertrophy',
                    'Address weak points identified at Show 1 before re-entering prep',
                    'Start dedicated prep for Show 2 approximately 16 weeks out',
                    'Use time between shows to practice posing and improve conditioning baseline',
                  ]
                }

                return (
                  <div key={nextShow.id} className="space-y-2">
                    {/* Bridge card */}
                    <div className="border border-dashed border-gray-700 rounded-xl p-4 bg-gray-900/50">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider">Transition Period</p>
                          <p className="text-sm font-semibold text-gray-200">{bridgeLabel}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{weeksBetween} week{weeksBetween !== 1 ? 's' : ''} between shows</p>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <p>After Show {idx + 1}</p>
                          <p className="text-gray-400">{new Date(prevShow.show_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                      </div>
                      <ul className="space-y-1">
                        {bridgeGuidance.map((g, i) => (
                          <li key={i} className="flex gap-2 text-xs text-gray-300">
                            <span className="text-brand-500 flex-shrink-0 mt-0.5">›</span>{g}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Next show header */}
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">Show {idx + 2}</p>
                        <p className="text-sm font-semibold text-gray-200">
                          {nextShow.name !== 'Competition' ? nextShow.name + ' — ' : ''}
                          {new Date(nextShow.show_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                        {nextShow.division && <p className="text-xs text-gray-500">{nextShow.division}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-gray-400">
                          {nextCountdown.weeks > 0 ? `${nextCountdown.weeks}w` : ''}{nextCountdown.days > 0 ? ` ${nextCountdown.days}d` : ''}
                        </p>
                        <p className="text-xs text-gray-600">out</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* ─── POSING GUIDE ─── */}
      {tab === 'posing' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {DIVISIONS.map((div) => (
              <button
                key={div.id}
                onClick={() => { setSelectedDivisionId(div.id); setExpandedPose(null) }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedDivisionId === div.id
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {div.name}
              </button>
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <h2 className="text-lg font-bold text-gray-100">{division.name}</h2>
              <span className="text-xs bg-brand-900/40 text-brand-400 border border-brand-800/40 rounded-full px-2 py-0.5 whitespace-nowrap ml-3">
                {division.bodyFatRange} body fat
              </span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{division.description}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="font-semibold text-gray-200 mb-3">What Judges Score</h3>
            <ul className="space-y-1.5">
              {division.judgingCriteria.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-400">
                  <span className="text-brand-500 flex-shrink-0">›</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-200 mb-3">
              Mandatory Poses ({division.mandatoryPoses.length})
            </h3>
            <div className="space-y-2">
              {division.mandatoryPoses.map((pose) => (
                <div
                  key={pose.id}
                  className={`border rounded-xl overflow-hidden transition-colors ${
                    expandedPose === pose.id
                      ? 'bg-gray-900 border-brand-700/50'
                      : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <button
                    onClick={() => setExpandedPose(expandedPose === pose.id ? null : pose.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📸</span>
                      <div>
                        <p className="font-semibold text-gray-100 text-sm">{pose.name}</p>
                        <span className="text-xs text-brand-400 capitalize">
                          {pose.type.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <span className={`text-xs ml-3 flex-shrink-0 px-2 py-0.5 rounded-full border transition-colors ${
                      expandedPose === pose.id
                        ? 'text-brand-300 border-brand-700 bg-brand-900/30'
                        : 'text-gray-400 border-gray-700'
                    }`}>
                      {expandedPose === pose.id ? '▲ Close' : '▼ View'}
                    </span>
                  </button>

                  {expandedPose === pose.id && (
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-800">
                      <div className="pt-3">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          Step-by-Step Instructions
                        </p>
                        <ol className="space-y-2">
                          {pose.instructions.map((inst, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-300 leading-snug">
                              <span className="text-brand-500 flex-shrink-0 font-bold">{i + 1}.</span>
                              {inst}
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          What Judges Look For
                        </p>
                        <ul className="space-y-1.5">
                          {pose.keyPoints.map((kp, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-300">
                              <span className="text-green-500 flex-shrink-0">✓</span>
                              {kp}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          Common Mistakes to Avoid
                        </p>
                        <ul className="space-y-1.5">
                          {pose.commonMistakes.map((m, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-300">
                              <span className="text-red-400 flex-shrink-0">✕</span>
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <button
                        onClick={() => openTutorial(pose.youtubeSearchQuery)}
                        className="flex items-center justify-center gap-2 text-sm text-red-400 hover:text-red-300 border border-red-900/40 hover:border-red-800/60 rounded-lg px-4 py-2.5 transition-colors w-full"
                      >
                        <span>▶</span>
                        Watch Tutorial on YouTube
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="font-semibold text-gray-200 mb-3">Stage Tips for {division.name}</h3>
            <ul className="space-y-2">
              {division.stageTips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-400 leading-snug">
                  <span className="text-yellow-500 flex-shrink-0">💡</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ─── COMPETITION PREP ─── */}
      {tab === 'prep' && (
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-gray-100 mb-1">First Timer Competition Checklist</h2>
            <p className="text-sm text-gray-500 mb-3">Tap any time block to expand the checklist for that phase.</p>
            <div className="space-y-2">
              {Object.entries(FIRST_TIMER_CHECKLIST).map(([key, section]) => {
                const isOpen = expandedChecklist === key
                return (
                  <div
                    key={key}
                    className={`rounded-xl border overflow-hidden transition-colors ${
                      isOpen ? 'border-brand-700/60 bg-gray-900' : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                    }`}
                  >
                    <button
                      onClick={() => setExpandedChecklist(isOpen ? null : key)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOpen ? 'bg-brand-500' : 'bg-gray-600'}`} />
                        <span className={`font-semibold text-sm ${isOpen ? 'text-brand-300' : 'text-gray-200'}`}>
                          {section.title}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ml-3 ${
                        isOpen ? 'text-brand-300 border-brand-700 bg-brand-900/30' : 'text-gray-500 border-gray-700'
                      }`}>
                        {isOpen ? '▲ Close' : `${section.items.length} items ▼`}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-gray-800">
                        <ul className="space-y-2 pt-3">
                          {section.items.map((item, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-300 leading-snug">
                              <span className="text-brand-500 flex-shrink-0 mt-0.5">□</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-bold text-gray-100 mb-1">Show Day Readiness Checklist</h2>
            <p className="text-sm text-gray-500 mb-4">Check off items as you prepare. Progress resets between sessions.</p>
            <div className="space-y-2">
              {STAGE_READINESS_CHECKLIST.map((item, i) => {
                const done = stageCheckDone.has(item)
                return (
                  <label key={i} className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => {
                        const next = new Set(stageCheckDone)
                        if (done) next.delete(item)
                        else next.add(item)
                        setStageCheckDone(next)
                      }}
                      className="mt-0.5 accent-brand-500"
                    />
                    <span className={`text-sm leading-snug transition-colors ${done ? 'text-gray-600 line-through' : 'text-gray-300 group-hover:text-gray-200'}`}>
                      {item}
                    </span>
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-gray-600 text-right mt-4">
              {stageCheckDone.size} / {STAGE_READINESS_CHECKLIST.length} items checked
            </p>
          </div>
        </div>
      )}

      {/* ─── PEAK WEEK ─── */}
      {tab === 'peakweek' && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-bold text-gray-100 mb-2">Peak Week Overview</h2>
            <p className="text-sm text-gray-400 leading-relaxed">{PEAK_WEEK_PROTOCOL.overview}</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-200 mb-3">Day-by-Day Protocol</h3>
            <div className="space-y-2">
              {PEAK_WEEK_PROTOCOL.days.map((day) => (
                <div key={day.daysOut} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-100 text-sm">{day.label}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-3 ${
                      day.daysOut >= 5 ? 'bg-red-900/30 text-red-400' :
                      day.daysOut >= 3 ? 'bg-blue-900/30 text-blue-400' :
                      'bg-green-900/30 text-green-400'
                    }`}>
                      {day.daysOut === 1 ? 'Show Day' : `${day.daysOut} days out`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
                    <div><span className="text-gray-500">Water: </span><span className="text-gray-300">{day.water}</span></div>
                    <div><span className="text-gray-500">Sodium: </span><span className="text-gray-300">{day.sodium}</span></div>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed mb-2">
                    <strong className="text-gray-500">Training:</strong> {day.training}
                  </p>
                  <p className="text-xs text-gray-400 leading-relaxed mb-3">
                    <strong className="text-gray-500">Nutrition:</strong> {day.nutrition}
                  </p>
                  {day.notes.length > 0 && (
                    <ul className="space-y-1 border-t border-gray-800 pt-2">
                      {day.notes.map((note, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-gray-500 leading-snug">
                          <span className="text-brand-600 flex-shrink-0">·</span>
                          {note}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="font-semibold text-gray-200 mb-1">Carb Load Calculator</h3>
            <p className="text-xs text-gray-500 mb-4">{PEAK_WEEK_PROTOCOL.carbLoadCalc.formula}</p>
            <div className="flex gap-3 items-end mb-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Bodyweight ({isImperial ? 'lbs' : 'kg'})</label>
                <input
                  type="number"
                  value={carbWeight}
                  onChange={(e) => setCarbWeight(e.target.value)}
                  placeholder={isImperial ? 'e.g. 185' : 'e.g. 84'}
                  className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                />
              </div>
              {carbWeight && !isNaN(parseFloat(carbWeight)) && (
                <div className="flex-1 bg-brand-900/20 border border-brand-800/30 rounded-xl p-3">
                  {(() => {
                    const kg = isImperial ? parseFloat(carbWeight) * 0.453592 : parseFloat(carbWeight)
                    const low = Math.round(kg * 8)
                    const high = Math.round(kg * 12)
                    return (
                      <>
                        <p className="text-xs text-gray-400">Total 3-day carb load:</p>
                        <p className="text-xl font-bold text-brand-400">{low}–{high}g</p>
                        <p className="text-xs text-gray-500">≈ {Math.round(low/3)}–{Math.round(high/3)}g per day</p>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Best Carb Load Foods</p>
            <ul className="space-y-1 mb-4">
              {PEAK_WEEK_PROTOCOL.carbLoadCalc.foods.map((food, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-400 leading-snug">
                  <span className="text-brand-500">·</span>{food}
                </li>
              ))}
            </ul>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Important Notes</p>
            <ul className="space-y-1">
              {PEAK_WEEK_PROTOCOL.carbLoadCalc.notes.map((note, i) => (
                <li key={i} className="flex gap-2 text-xs text-amber-600 leading-snug">
                  <span className="text-amber-500 flex-shrink-0">⚠</span>{note}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="font-semibold text-gray-200 mb-3">Water Protocol</h3>
              <ul className="space-y-2">
                {PEAK_WEEK_PROTOCOL.waterProtocol.map((line, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-400 leading-snug">
                    <span className="text-blue-400 flex-shrink-0">·</span>{line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="font-semibold text-gray-200 mb-3">Sodium Protocol</h3>
              <ul className="space-y-2">
                {PEAK_WEEK_PROTOCOL.sodiumProtocol.map((line, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-400 leading-snug">
                    <span className="text-yellow-400 flex-shrink-0">·</span>{line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ─── FIRST TIMER ─── */}
      {tab === 'firsttimer' && (
        <div className="space-y-4">
          <div className="bg-brand-900/10 border border-brand-800/30 rounded-xl p-4">
            <h2 className="font-bold text-gray-100 mb-2">Welcome to Your First Competition</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Competing for the first time is one of the most rewarding experiences in fitness. Use this guide to arrive fully prepared, confident, and ready to showcase months of dedicated hard work. Every champion was once a first-timer.
            </p>
          </div>

          <div className="space-y-2">
            {Object.entries(FIRST_TIMER_CHECKLIST).map(([key, section]) => {
              const isOpen = expandedChecklist === ('ft_' + key)
              return (
                <div
                  key={key}
                  className={`rounded-xl border overflow-hidden transition-colors ${
                    isOpen ? 'border-brand-700/60 bg-gray-900' : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                  }`}
                >
                  <button
                    onClick={() => setExpandedChecklist(isOpen ? null : 'ft_' + key)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOpen ? 'bg-brand-500' : 'bg-gray-600'}`} />
                      <span className={`font-semibold text-sm ${isOpen ? 'text-brand-300' : 'text-gray-200'}`}>
                        {section.title}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ml-3 ${
                      isOpen ? 'text-brand-300 border-brand-700 bg-brand-900/30' : 'text-gray-500 border-gray-700'
                    }`}>
                      {isOpen ? '▲ Close' : `${section.items.length} items ▼`}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-gray-800">
                      <ul className="space-y-2 pt-3">
                        {section.items.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm text-gray-300 leading-snug">
                            <span className="text-brand-500 flex-shrink-0 mt-0.5">□</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="bg-amber-900/10 border border-amber-800/30 rounded-lg p-3 text-xs text-amber-600">
            <strong className="text-amber-500">Disclaimer:</strong> PrepCoach provides educational guidance only. Individual responses to peak week protocols vary significantly. Consult with an experienced coach or sports medicine professional before implementing any extreme dietary or hydration manipulation.
          </div>
        </div>
      )}
    </div>
  )
}
