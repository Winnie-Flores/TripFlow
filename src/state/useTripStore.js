import { useStore } from 'zustand'
import { tripStore } from './tripStore.js'
export function useTripStore(selector) { return useStore(tripStore, selector) }
