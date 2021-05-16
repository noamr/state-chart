import startScxmlAlgorithm, {ScxmlAlgorithm} from './scxml-impl';
import matchSelectorWithBackRefs, {BackRefMatcher} from './backref-selector';
import {assert} from './common'

export default function startScxmlDOM(scxml: Element) {
    const window = scxml.ownerDocument.defaultView as Window
    const cancelers = new WeakMap<Element, () => void>([])
    let algo: ScxmlAlgorithm<Event> | null = null
    const matcherCache = new WeakMap<Element, BackRefMatcher>([])
    const hostSelector = scxml.getAttribute('host')
    let host: HTMLElement | null = null
    const getHost = () => {
        if (host)
            return host
        host = window.document.querySelector('hostSelector') as HTMLElement
        return host
    }

    const client = {
        matchEvent: (transition: Element, event: Event | null) => {
            if (!event)
                return !transition.hasAttribute('event')

            if (event.type !== transition.getAttribute('event'))
                return null

            const match = transition.getAttribute('match')

            if (!event.target)
                return !match

            if (!match)
                return {}

            let matcher = matcherCache.get(transition)
            if (!matcher) {
                matcher = matchSelectorWithBackRefs(match)
                matcherCache.set(transition, matcher)
            }

            return matcher(event.target as Element)
        },
        toggleInvoke: (invokeElement: Element, enabled: boolean) => {
            switch (invokeElement.getAttribute('type')) {
                case 'class': {
                    getHost().classList.toggle(assert(invokeElement.getAttribute('name')), enabled)
                    break
                }
            }
        },
        execute: (element: Element, eventPayload: {[key: string]: string} | null) => {
            function replaceFromPayload(s: string) {
                for (const [k, v] of Object.entries(eventPayload || {}))
                    s = s.replaceAll(`\${${k}}`, v)

                return s
            }

            if (element.tagName === 'SEND') {
                const target = element.getAttribute('target')
                const path = replaceFromPayload(element.getAttribute('path') || '/')
                const method = (element.getAttribute('method') || 'POST').toUpperCase() as RestMethod
                const data = new FormData()
                element.querySelectorAll('data').forEach(d => {
                    const name = d.getAttribute('name')
                    const value = replaceFromPayload(d.getAttribute('value') || '')
                    if (name && value)
                    data.set(name, value)
                })

                if (target && event)
                    assert(document.querySelector(target)).dispatchEvent(new RestEvent({path, data, method}))
            }
        },
        toggleTransition: (transition: Element, enabled: boolean) => {
            if (!enabled) {
                const canceler = cancelers.get(transition)
                if (canceler) {
                    canceler()
                    cancelers.delete(transition)
                }

                return
            }

            const type = assert(transition.getAttribute('event'))
            const match = transition.getAttribute('match')

            if (!match)
                return

            const controller = new AbortController()
            const signal = controller.signal

            const listener = (e: Event) => {
                if (!algo || !e.target || !(e.target as HTMLElement).matches(match))
                    return
                algo.dispatch(e)                        
            }

            const options = {capture: true}
            getHost().addEventListener(type, listener, options)
            cancelers.set(transition, () => getHost().removeEventListener(type, listener, options))
        }
    }

    algo = startScxmlAlgorithm<Event>(scxml, client)

    return {
        terminate: () => algo && algo.terminate()
    }
}