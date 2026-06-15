/**
 * EditableView adapters — per-kind wrappers that let EditController work
 * uniformly across the five bespoke view kinds (tree, flower, fruit,
 * mailbox, telescope).
 *
 * Each adapter exposes:
 *   getObject3D(layoutId)  — resolve the THREE.Group for a layout id
 *   hitTargets()           — array of Object3D meshes for raycasting
 *   applyTransform(id, t)  — apply {x?,z?,yaw?,scale?} live (does not
 *                            commit to IslandLayout — caller does that)
 *   spawn(obj)             — stub; see plan 003
 *   remove(id)             — stub; see plan 003
 *
 * `buildEditableViews(view, island)` returns the full map.
 */

/**
 * @param {import('../View.js').default} view
 * @param {import('../../State/Island.js').default} island
 * @param {import('../../State/IslandLayout.js').default} [layout]
 */
export function buildEditableViews(view, island, layout)
{
    return {
        tree:      buildTreeAdapter(view, island, layout),
        flower:    buildFlowerAdapter(view, island, layout),
        fruit:     buildFruitAdapter(view, island, layout),
        mailbox:   buildMailboxAdapter(view, island, layout),
        telescope: buildTelescopeAdapter(view, island, layout),
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build spawn/remove helpers for a given kind that delegate to the view's
 * ensureFromLayout. The layout slice has already been mutated before these
 * are called, so we just trigger the reconcile.
 *
 * @param {object} view
 * @param {import('../../State/IslandLayout.js').default} layout
 * @param {string} kind
 */
function buildSpawnRemove(view, layout, kind)
{
    const reconcile = () =>
    {
        const objs = layout?.listByKind?.(kind) ?? []
        // Try both singular and plural names (tree→view.tree, flower→view.flowers).
        const target = view[kind] ?? view[`${kind}s`]
        target?.ensureFromLayout?.(objs)
    }

    return {
        spawn: (_obj) => reconcile(),
        remove: (_id) => reconcile(),
    }
}

// ── Tree ─────────────────────────────────────────────────────────────────────

function buildTreeAdapter(view, island, layout)
{
    return {
        getObject3D(layoutId)
        {
            const entry = view.tree?.entries?.find((e) => e.layoutId === layoutId)
            return entry?.group ?? null
        },

        hitTargets()
        {
            if(!view.tree?.entries) return []
            return view.tree.entries
                .map((e) => e.group)
                .filter(Boolean)
        },

        applyTransform(id, t)
        {
            const entry = view.tree?.entries?.find((e) => e.layoutId === id)
            if(!entry || !entry.group) return

            const x = typeof t.x === 'number' ? t.x : entry.group.position.x
            const z = typeof t.z === 'number' ? t.z : entry.group.position.z

            const idx = view.tree.entries.indexOf(entry)
            if(typeof view.tree.moveEntry === 'function')
            {
                view.tree.moveEntry(idx, x, z)
            }
            else
            {
                const y = island.heightAt(x, z)
                entry.group.position.set(x, y, z)
            }

            if(typeof t.yaw === 'number')  entry.group.rotation.y = t.yaw
            if(typeof t.scale === 'number') entry.group.scale.setScalar(t.scale)
        },

        ...buildSpawnRemove(view, layout, 'tree'),
    }
}

// ── Flower ────────────────────────────────────────────────────────────────────

function buildFlowerAdapter(view, island, layout)
{
    return {
        getObject3D(layoutId)
        {
            const f = view.flowers?.flowers?.find((fl) => fl.layoutId === layoutId)
            return f?.group ?? null
        },

        hitTargets()
        {
            if(!view.flowers?.flowers) return []
            return view.flowers.flowers
                .map((f) => f.group)
                .filter(Boolean)
        },

        applyTransform(id, t)
        {
            const f = view.flowers?.flowers?.find((fl) => fl.layoutId === id)
            if(!f || !f.group) return

            const x = typeof t.x === 'number' ? t.x : f.group.position.x
            const z = typeof t.z === 'number' ? t.z : f.group.position.z

            const idx = view.flowers.flowers.indexOf(f)
            if(typeof view.flowers.moveInstance === 'function')
            {
                view.flowers.moveInstance(idx, x, z)
            }
            else
            {
                const y = island.heightAt(x, z)
                f.group.position.set(x, y, z)
            }

            if(typeof t.yaw === 'number')  f.group.rotation.y = t.yaw
            if(typeof t.scale === 'number') f.group.scale.setScalar(t.scale)
        },

        ...buildSpawnRemove(view, layout, 'flower'),
    }
}

// ── Fruit ─────────────────────────────────────────────────────────────────────

function buildFruitAdapter(view, island, layout)
{
    return {
        getObject3D(layoutId)
        {
            const entry = view.fruits?.entries?.find((e) => e.layoutId === layoutId)
            return entry?.group ?? null
        },

        hitTargets()
        {
            if(!view.fruits?.entries) return []
            return view.fruits.entries
                .map((e) => e.group)
                .filter(Boolean)
        },

        applyTransform(id, t)
        {
            const entry = view.fruits?.entries?.find((e) => e.layoutId === id)
            if(!entry || !entry.group) return

            const x = typeof t.x === 'number' ? t.x : entry.group.position.x
            const z = typeof t.z === 'number' ? t.z : entry.group.position.z

            const idx = view.fruits.entries.indexOf(entry)
            if(typeof view.fruits.moveEntry === 'function')
            {
                view.fruits.moveEntry(idx, x, z)
            }
            else
            {
                const y = island.heightAt(x, z)
                entry.group.position.set(x, y, z)
            }

            if(typeof t.yaw === 'number')  entry.group.rotation.y = t.yaw
            if(typeof t.scale === 'number') entry.group.scale.setScalar(t.scale)
        },

        ...buildSpawnRemove(view, layout, 'fruit'),
    }
}

// ── Mailbox ───────────────────────────────────────────────────────────────────

function buildMailboxAdapter(view, island, layout)
{
    return {
        getObject3D(_layoutId)
        {
            return view.mailbox?.group ?? null
        },

        hitTargets()
        {
            const g = view.mailbox?.group
            return g ? [g] : []
        },

        applyTransform(id, t)
        {
            const g = view.mailbox?.group
            if(!g) return

            const x = typeof t.x === 'number' ? t.x : g.position.x
            const z = typeof t.z === 'number' ? t.z : g.position.z

            if(typeof view.mailbox.move === 'function')
            {
                view.mailbox.move(x, z)
            }
            else
            {
                const y = island.heightAt(x, z)
                g.position.set(x, y, z)
            }

            if(typeof t.yaw === 'number')  g.rotation.y = t.yaw
            if(typeof t.scale === 'number') g.scale.setScalar(t.scale)
        },

        ...buildSpawnRemove(view, layout, 'mailbox'),
    }
}

// ── Telescope ─────────────────────────────────────────────────────────────────

function buildTelescopeAdapter(view, island, layout)
{
    return {
        getObject3D(_layoutId)
        {
            return view.telescope?.group ?? null
        },

        hitTargets()
        {
            const g = view.telescope?.group
            return g ? [g] : []
        },

        applyTransform(id, t)
        {
            const g = view.telescope?.group
            if(!g) return

            const x = typeof t.x === 'number' ? t.x : g.position.x
            const z = typeof t.z === 'number' ? t.z : g.position.z

            if(typeof view.telescope.move === 'function')
            {
                view.telescope.move(x, z)
            }
            else
            {
                const y = island.heightAt(x, z)
                g.position.set(x, y, z)
            }

            if(typeof t.yaw === 'number')  g.rotation.y = t.yaw
            if(typeof t.scale === 'number') g.scale.setScalar(t.scale)
        },

        ...buildSpawnRemove(view, layout, 'telescope'),
    }
}
