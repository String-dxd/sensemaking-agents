import { materializeMyWorldFaqBuildStory } from './build-story'
import { digestMyWorldFaqDocument } from './compose-document'
import type { MyWorldFaqEditorialDocument } from './content-schema'
import { materializeMyWorldFaqPostureStory } from './posture-story'
import { materializeMyWorldFaqWhyStory } from './why-story'

export interface MyWorldFaqEditorProjection {
  document: MyWorldFaqEditorialDocument
  digest: string
}

/**
 * Complete optional narrative sections for the collaborative editor without
 * rewriting historical revision bodies. Call this only when a document is
 * crossing the protected editor boundary or being compared as an editor base.
 */
export function materializeMyWorldFaqEditorDocument(
  document: MyWorldFaqEditorialDocument,
): MyWorldFaqEditorialDocument {
  return materializeMyWorldFaqPostureStory(
    materializeMyWorldFaqWhyStory(materializeMyWorldFaqBuildStory(document)),
  )
}

/**
 * Bind a browser-visible editor projection to the exact compiled defaults that
 * completed it. The stored revision digest intentionally cannot do this: old
 * revision bodies remain immutable while their optional editor defaults may
 * evolve with a later deployment.
 */
export async function projectMyWorldFaqEditorDocument(
  document: MyWorldFaqEditorialDocument,
): Promise<MyWorldFaqEditorProjection> {
  const projectedDocument = materializeMyWorldFaqEditorDocument(document)
  return {
    document: projectedDocument,
    digest: await digestMyWorldFaqDocument(projectedDocument),
  }
}
