import { useCallback, useEffect, useState } from "react"
import { getSafeKVClient } from "@/lib/spark-shim"

type SetStateAction<T> = T | ((prev: T | undefined) => T | undefined)

export function useSafeKV<T>(key: string, defaultValue?: T): [T | undefined, (value: SetStateAction<T>) => void] {
  const kv = getSafeKVClient()
  const [value, setValue] = useState<T | undefined>(defaultValue)

  useEffect(() => {
    let isActive = true

    const loadValue = async () => {
      const stored = await kv.get<T>(key)
      if (!isActive) return

      if (stored !== undefined) {
        setValue(stored)
      } else if (defaultValue !== undefined) {
        setValue(defaultValue)
        kv.set(key, defaultValue)
      }
    }

    loadValue()

    return () => {
      isActive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const updateValue = useCallback(
    (next: SetStateAction<T>) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? (next as (prev: T | undefined) => T | undefined)(current) : next
        kv.set(key, resolved as T)
        return resolved
      })
    },
    [key, kv]
  )

  return [value, updateValue]
}
