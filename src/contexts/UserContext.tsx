import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { UserRole, DisasterMode } from '../types'
import { DEFAULT_LOC } from '../utils/geo'
import type { LatLng } from '../utils/geo'

interface UserCtx {
  role: UserRole
  disaster: DisasterMode
  setRole: (r: UserRole) => void
  setDisaster: (d: DisasterMode) => void
  isOnline: boolean
  // 使用者位置
  userLoc: LatLng
  setUserLoc: (loc: LatLng) => void
  locating: boolean
  geoError: string | null
  locateMe: () => Promise<LatLng>
}

const UserContext = createContext<UserCtx | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [role, setRole]       = useState<UserRole>('adult')
  const [disaster, setDisaster] = useState<DisasterMode>('earthquake')
  // B2 fix: 監聽 online/offline 事件，即時更新
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // 使用者位置：預設為東區中心，成功定位後覆寫
  const [userLoc, setUserLoc] = useState<LatLng>(DEFAULT_LOC)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const locateMe = useCallback((): Promise<LatLng> => {
    return new Promise<LatLng>((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        setGeoError('此裝置不支援定位功能')
        reject(new Error('geolocation unsupported'))
        return
      }
      setLocating(true)
      setGeoError(null)
      navigator.geolocation.getCurrentPosition(
        pos => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setUserLoc(loc)
          setLocating(false)
          resolve(loc)
        },
        err => {
          setLocating(false)
          setGeoError(
            err.code === err.PERMISSION_DENIED
              ? '已拒絕定位權限，使用預設位置'
              : '無法取得目前位置，使用預設位置',
          )
          reject(err)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    })
  }, [])

  // 進入 App 時自動嘗試定位一次
  useEffect(() => {
    locateMe().catch(() => { /* 已在 state 記錄錯誤，保留預設位置 */ })
  }, [locateMe])

  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online',  on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <UserContext.Provider
      value={{
        role, disaster, setRole, setDisaster, isOnline,
        userLoc, setUserLoc, locating, geoError, locateMe,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be inside UserProvider')
  return ctx
}
