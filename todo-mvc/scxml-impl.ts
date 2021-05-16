export interface ScxmlAlgorithm<EventType> {
    terminate(): void
    dispatch(e: EventType): void
}

type EventPayload = {[key: string]: string} | null

export interface ScxmlClient<EventType> {
    matchEvent(transition: Element, event: EventType | null): {[key: string]: string} | null
    toggleInvoke(invokeElement: Element, enabled: boolean): void
    execute(executableElement: Element, payload: EventPayload): void
    toggleTransition(transition: Element, enabled: boolean): void
}

export default function startScxmlAlgorithm<EventType>(rootState: Element, client: ScxmlClient<EventType>): ScxmlAlgorithm<EventType> {
    const config = new Set<Element>()
    const statesToInvoke = new Set<Element>()
    const internalQueue: EventType[] = []
    const externalQueue: EventType[] = []
    let currentEvent: EventType | null = null
    const historyValue = new WeakMap<Element, Element[]>([])
    let eventPayload: EventPayload
    let running = true

    const {toggleInvoke, execute, matchEvent, toggleTransition} = client

    const transitionTargets = new WeakMap<Element, Element[]>([])

    function findChildren(e: Element, name: string): Element[] {
        return Array.from(e.childNodes).filter(c => c instanceof Element && c.tagName === name.toUpperCase()) as Element[]
    }

    const getChildStates = (e: Element): Element[] =>
        Array.from(e.childNodes).filter(c =>
            c instanceof Element && (c.tagName === 'STATE' || c.tagName === 'PARALLEL' || c.tagName === 'HISTORY')) as Element[]

    const intersectSets = <T>(s1: Set<T>, s2: Set<T>) => Array.from(s1).some(t => s2.has(t))
    const documentOrder = (a: Node, b: Node) => a.compareDocumentPosition(b)
    const entryOrder = documentOrder
    const exitOrder = (a: Node, b: Node) => b.compareDocumentPosition(a)

    function pathOrNull(e: Element, path: string[]): Element | null {
        if (!path.length)
            return e

        const c = findChildren(e, path[0])
        if (!c.length)
            return null

        return pathOrNull(c[0], path.slice(1))
    }

    function assertPath(e: Element, path: string[]): Element {
        const p = pathOrNull(e, path)
        if (!p)
            throw new Error(`Expected path ${path} for ${e.tagName}`)
        return p
    }

    function createTransitionTo(state: Element) {
        const t = state.ownerDocument.createElement('transition')        
        transitionTargets.set(t, [state])
        return t
    }

    function initialTransitionsFor(state: Element): Element[] {
        if (state.hasAttribute('initial'))
            return [createTransitionTo(rootState.querySelector(`state#${state.getAttribute('initial')}`) as Element)]

        const initial = findChildren(state, 'initial')[0]
        if (initial)
            return [(initial as Element).querySelector('transition') as Element]

        const firstChild = findChildren(state, 'state')[0]
        if (firstChild)
            return [createTransitionTo(firstChild)]

        return []
    }

    function exitInterpreter() {
        for (const s of Array.from(config).sort(exitOrder)) {
            const state = s as Element
            const onexit = findChildren(state, 'onexit').sort(documentOrder)
            onexit.forEach(executeContent)
            const invokes = findChildren(state, 'invoke').sort(documentOrder)
            invokes.forEach(i => toggleInvoke(i, false))
            for (const t of findChildren(state, 'transition'))
                toggleTransition(t, false)
        }
    }

    function getTransitions(state: Element): Element[] {
        return [...state.childNodes].filter(s => (s as Element).tagName === 'TRANSITION')
    }

    function isAtomicState(s: Element): boolean {
        return !isCompoundState(s)
    }

    function selectTransitions(e: EventType | null) {
        const enabledTransitions = new Set<Element>()
        const atomicStates = Array.from(config).filter(isAtomicState).sort(documentOrder)
        for (const state of atomicStates) {
            [state, ...getProperAncestors(state, null)].find(s => {
                for (const t of getTransitions(state).sort(documentOrder)) {
                    const currentEventPayload = matchEvent(t, e)
                    if (currentEventPayload) {
                        enabledTransitions.add(t)
                        eventPayload = currentEventPayload
                        return true
                    }
                }

                return false
            })
        }

        return removeConflictingTransitions(enabledTransitions)
    }

    function executeContent(element: Element | null) {
        if (!element)
            return

        for (const node of element.childNodes) {
            if (node instanceof Element)
                execute(node as Element, eventPayload)
        }
    }

    function microstep(transitions: Set<Element>) {
        exitStates(transitions)
        transitions.forEach(executeContent)
        enterStates(transitions)
    }

    function enterStates(transitions: Set<Element>) {
        const statesToEnter = new Set<Element>()
        const statesForDefaultEntry = new Set<Element>()
        const defaultHistoryContent = new WeakMap<Element, Element[]>([])

        function computeEntrySet() {
            for (const t of transitions) {
                for (const s of getTargetStates(t))
                    addDescendantStatesToEnter(s)
                const ancestor = getTransitionDomain(t) || rootState
                for (const s of getEffectiveTargetStates(t))
                    addAncestorStatesToEnter(s, ancestor)
            }
        }

        function addDescendantStatesToEnter(state: Element) {
            if (state.tagName === 'HISTORY') {
                if (historyValue.has(state)) {
                    const values = historyValue.get(state) as Element[]
                    for (const s of values)
                        addDescendantStatesToEnter(s)
                    for (const s of values)
                        addAncestorStatesToEnter(s, state.parentElement as Element)
                } else {

                }
                return
            }
            statesToEnter.add(state)
            if (isCompoundState(state)) {
                statesForDefaultEntry.add(state)
                const targets = getTargetStates(initialTransitionsFor(state)[0]) as Element[]
                addDescendantStatesToEnter(targets[0])
                addAncestorStatesToEnter(targets[0], state)
            } else if (state.tagName === 'PARALLEL') {
                for (const child of getChildStates(state)) {
                    if (!Array.from(statesToEnter).some(s => isDescendant(s, child)))
                        addDescendantStatesToEnter(child)
                }
            }
        }

        function addAncestorStatesToEnter(state: Element, ancestor: Element) {
            for (const anc of getProperAncestors(state, ancestor)) {
                statesToEnter.add(anc)
                if (anc.tagName === 'PARALLEL') {
                    for (const child of getChildStates(anc)) {
                        if (!Array.from(statesToEnter).some(s => isDescendant(s, child)))
                            addDescendantStatesToEnter(child)
                    }
                }
            }
        }

        computeEntrySet()
        for (const s of Array.from(statesToEnter).sort(entryOrder)) {
            config.add(s)
            statesToInvoke.add(s)
            findChildren(s, 'onentry').sort(documentOrder).map(executeContent)
            if (statesForDefaultEntry.has(s))
                executeContent(pathOrNull(s, ['initial', 'transition']))
            if (defaultHistoryContent.has(s))
                (defaultHistoryContent.get(s) as Element[]).forEach(executeContent)
        }
    }


    function exitStates(transitions: Set<Element>) {
        const statesToExit = computeExitSet(transitions)
        for (const s of statesToExit)
            statesToInvoke.delete(s)

        const toExit = Array.from(statesToExit).sort(exitOrder)
        for (const s of toExit) {
            for (const h of findChildren(s, 'history')) {
                const f = h.getAttribute('deep') === 'true' ?
                    ((s0: Element) => isAtomicState(s0) && isDescendant(s0, s)):
                    ((s0: Element) => s0.parentElement === s)

                historyValue.set(s, [...config].filter(f))
            }
        }
        for (const s of toExit) {
            findChildren(s, 'onexit').sort(documentOrder).map(executeContent)
            findChildren(s, 'invoke').forEach(i => toggleInvoke(i, false))
            config.delete(s)
        }
    }

    function computeExitSet(transitions: Set<Element>) {
        const toExit = new Set<Element>()
        for (const t of transitions) {
            const targets = getTargetStates(t)
            if (targets.length) {
                const domain = getTransitionDomain(t)
                for (const s of config) {
                    if (isDescendant(s, domain))
                        toExit.add(s)
                }
            }
        }

        return toExit
    }

    function removeConflictingTransitions(enabledTransitions: Set<Element>) {
        const filteredTransitions = new Set<Element>()
        for (const t1 of enabledTransitions) {
            let t1Preempted = false
            const transitionsToRemove = new Set<Element>()
            for (const t2 of filteredTransitions) {
                if (intersectSets(computeExitSet(new Set([t1])), computeExitSet(new Set([t2]))))
                    transitionsToRemove.add(t2)
                else {
                    t1Preempted = true
                    break
                }
            }

            if (!t1Preempted) {
                for (const t3 of transitionsToRemove)
                    filteredTransitions.delete(t3)
                filteredTransitions.add(t1)
            }
        }
        
        return filteredTransitions
    }

    const isCompoundState = (e: Element) => !!e.querySelector('state,parallel')

    function getTargetStates(t: Element): Element[] {
        if (transitionTargets.has(t))
            return transitionTargets.get(t) as Element[]

        const targets = (t.getAttribute('target') || '').split(' ').map(t => rootState.querySelector(`#${t}`) as Element)
        transitionTargets.set(t, targets)
        return targets
    }

    function getEffectiveTargetStates(t: Element): Set<Element> {
        const targets = new Set<Element>()
        for (const s of getTargetStates(t)) {
            if (s.tagName === 'HISTORY') {
                const toAdd = historyValue.get(s) || getEffectiveTargetStates(assertPath(s, ['transition']))
                for (const a of toAdd)
                    targets.add(a)               
            } else {
                targets.add(s)
            }
        }

        return targets
    }

    function getTransitionDomain(t: Element): Element {
        const states = getEffectiveTargetStates(t)
        if (!states.size)
            return rootState

        const source = t.parentElement as Element

        if (isCompoundState(source) && Array.from(states).every(s => isDescendant(s, source)))
            return source

        return findLCCA([source, ...states])
    }

    function findLCCA(states: Element[]) {
        for (const anc of getProperAncestors(states[0], null).filter(isCompoundState))
            if (states.slice(1).every(s => isDescendant(s, anc)))
                return anc

        return rootState
    }

    function getProperAncestors(s1: Element, s2: Element | null) {
        function getPA(s: Element | null): Element[] {
            if (s === s2 || !s)
                return []
            
            if (!s2 && s === rootState)
                return [s]

            return [s, ...getPA(s.parentElement)]
        }

        return getPA(s1.parentElement)
    }

    function isDescendant(s1: Element, s2: Element): boolean {
        return !!s1.parentElement && (s1.parentElement === s2 || isDescendant(s1.parentElement, s2))
    }

    function eventLoop() {
        do {
            let enabledTransitions = new Set<Element>()
            let macrostepDone = false
            while (running && !macrostepDone) {
                enabledTransitions = selectTransitions(null)
                if (!enabledTransitions.size) {
                    if (!internalQueue.length)
                        macrostepDone = true
                    else {
                        currentEvent = internalQueue.shift() || null
                        enabledTransitions = selectTransitions(currentEvent)
                    }
                }
            }

            if (enabledTransitions.size)
                microstep(enabledTransitions)

            if (!running)
                break

            for (const state of statesToInvoke) {
                for (const inv of findChildren(state, 'invoke'))
                    toggleInvoke(inv, true)
                for (const t of findChildren(state, 'transition'))
                    toggleTransition(t, true)
            }

            statesToInvoke.clear()

            if (internalQueue.length)
                continue

            if (!externalQueue.length)
                break
            
            currentEvent = externalQueue.shift() as EventType      
            enabledTransitions = selectTransitions(currentEvent as EventType)

            if (enabledTransitions.size)
                microstep(enabledTransitions)
        } while (false)
    }

    enterStates(new Set(initialTransitionsFor(rootState)))
    eventLoop()

    return {
        dispatch(e: EventType) {
            externalQueue.push(e)
            eventLoop()
        },

        terminate() {
            exitInterpreter()
        }
    }
}

