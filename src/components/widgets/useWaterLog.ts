import { useEffect, useState } from 'react'

export function useWaterLog(units: 'metric' | 'imperial') {
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [waterMl, setWaterMl] = useState(0)
  const [waterTargetMl, setWaterTargetMl] = useState(units === 'imperial' ? 3785 : 3000)

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(`water_ml_${todayStr}`) ?? '0', 10)
    setWaterMl(isNaN(stored) ? 0 : stored)
    const storedTarget = parseInt(localStorage.getItem('water_target_ml') ?? '0', 10)
    if (storedTarget > 0) setWaterTargetMl(storedTarget)
    else setWaterTargetMl(units === 'imperial' ? 3785 : 3000)
  }, [todayStr, units])

  function addWater(ml: number) {
    const newVal = Math.max(0, waterMl + ml)
    setWaterMl(newVal)
    localStorage.setItem(`water_ml_${todayStr}`, String(newVal))
  }

  function setTarget(ml: number) {
    setWaterTargetMl(ml)
    localStorage.setItem('water_target_ml', String(ml))
  }

  return { waterMl, waterTargetMl, addWater, setTarget }
}
