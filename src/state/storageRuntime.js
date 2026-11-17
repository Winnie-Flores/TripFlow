import { tripStore } from './tripStore.js'
import { startLibraryPersistence } from './libraryPersistence.js'
export const persistence = startLibraryPersistence(tripStore)
if (import.meta.hot) import.meta.hot.dispose(() => persistence.destroy())
