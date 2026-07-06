import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ModelGallery } from './scene/ModelGallery'

// Dev affordance: `?gallery` renders the procedural object-model gallery instead
// of the editor, to eyeball every ObjectKind. Harmless in prod; can be dropped
// once the object palette (Plan C) provides previews.
const showGallery = typeof window !== 'undefined' && window.location.search.includes('gallery')

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{showGallery ? <ModelGallery /> : <App />}</React.StrictMode>,
)
