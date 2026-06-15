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
 * @param {import('../Island.js').default} island
 */
export function buildEditableViews(view, island)
{
    return {
        tree:      buildTreeAdapter(view, island),
        flower:    buildFlowerAdapter(view, island),
        fruit:     buildFruitAdapter(view, island),
        mailbox:   buildMailboxAdapter(view, island),
        telescope: buildTelescopeAdapter(view, island),
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stubSpawn(kind)
{
    return (obj) => console.warn(`[editableViews:${kind}] spawn() not yet implemented — see plan 003`, obj)
}

function stubRemove(kind)
{
    return (id) => console.warn(`[editableViews:${kind}] remove() not yet implemented — see plan 003`, id)
}

// ── Tree ─────────────────────────────────────────────────────────────────────

function buildTreeAdapter(view, island)
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

        spawn: stubSpawn('tree'),
        remove: stubRemove('tree'),
    }
}

// ── Flower ────────────────────────────────────────────────────────────────────

function buildFlowerAdapter(view, island)
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

        spawn: stubSpawn('flower'),
        remove: stubRemove('flower'),
    }
}

// ── Fruit ─────────────────────────────────────────────────────────────────────

function buildFruitAdapter(view, island)
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

        spawn: stubSpawn('fruit'),
        remove: stubRemove('fruit'),
    }
}

// ── Mailbox ───────────────────────────────────────────────────────────────────

function buildMailboxAdapter(view, island)
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

        spawn: stubSpawn('mailbox'),
        remove: stubRemove('mailbox'),
    }
}

// ── Telescope ─────────────────────────────────────────────────────────────────

function buildTelescopeAdapter(view, island)
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

        spawn: stubSpawn('telescope'),
        remove: stubRemove('telescope'),
    }
}
