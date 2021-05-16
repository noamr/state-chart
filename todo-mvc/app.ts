function mvc({host, controller}) {
    /*
    const apply = (type, name, value) => {
        switch (type) {
            case 'attribute':
                value === null ? host.removeAttribute(name) : host.setAttribute(name, value)
                break
            case 'class':
                value ? host.classList.add(name) : host.classList.removeAttribute(name)
                break;
        }
    }
    */
}


interface Field {
    type: 'string' | 'boolean' | 'number'
    getDefault: () => any
}

interface Filter {
    defaultValue: boolean
    matchers: Array<{field: Field, value: string | boolean | number | null}>
}

interface Model {
    fields: Map<string, Field>
    filters: Map<string, Filter>
}

interface Controller {
    stop(): void
    dispatch(event: string, payload: any): void
}

function createUid() {
    return `uid-${Number(new Date()).toString(36)}`
}

function startControllerProxy(scxml: Element, {
    toggleClass
}: {toggleClass: (name: string, enabled: boolean) => void}): Controller {
    return {
        dispatch: (event: string, payload: any) => {

        },

        stop: () => {

        }
    }
}

function initController(scxml: Element, models: Map<string, Model>, host: HTMLElement): Controller {
    const controllerDefinition = scxml.cloneNode(true) as Element
    const hostEvents = Array.from(controllerDefinition.querySelectorAll('transition[event]')).map(
        t => ({match: t.getAttribute('match'), event: t.getAttribute('event') as string, transition: t}))

    const matchParams = (event: Event, match: string) {

    }

    const listen = (name: string, match: string | null, callback: (params: any) => void) => {
        let element = host as Document | Element
        let capture = false
        if (match && match.startsWith(':document'))
            element = host.ownerDocument
        else if (match && match.startsWith(':window'))
            element = host.ownerDocument.defaultView
        else
            capture = true

        const listener = (e: Event) => {
            const payload = matchParams(e, match)
            if (payload)
                callback(payload)
        }

        element.addEventListener(name, listener, {capture})
    }
    
    let nextEventId = 0

    let impl = null as Controller | null

    hostEvents.forEach(({match, event, transition}) => {
        const eventId = createUid() + ':' + nextEventId++
        transition.removeAttribute('match')
        transition.setAttribute('event', eventId)
        listen(event, match, payload => (impl as Controller).dispatch(eventId, payload))
    })

    impl = startControllerProxy(controllerDefinition, {
        toggleClass(name: string, enabled: boolean) {
            host.classList.toggle(name, enabled)
        }
    })
    
    return impl as Controller
}

function parseModel(e: Element): Model {
    const fields = new Map<string, Field>()
    const filters = new Map<string, Filter>()
    for (const child of e.childNodes) {
        switch (child.tagName) {
            case 'FIELD': {
                const name = child.getAttribute('name')
                const type = child.getAttribute('type') as 'string' | 'boolean' | 'number'
                const defaultValue = child.textContent
                const getDefault = defaultValue === ':uuid:' ? createUid : () => defaultValue
                fields.set(name, {type, getDefault})
                break;
            }
            case 'FILTER': {
                const name = child.getAttribute('name')
                const defaultValue = child.getAttribute('default') && !!JSON.parse(child.getAttribute('default'))
                const matchElements = (Array.from(child.childNodes) as Element[]).filter(e => e.tagName === 'MATCH')
                const matchers = matchElements.map(m => ({
                    field: m.getAttribute('field'),
                    value: m.textContent === null ? null : (JSON.parse(m.textContent) as string | boolean | number)
                }))

                filters.set(name, {defaultValue, matchers})
                break;
            }
        }
    }

    return {fields, filters}
}

class MVC extends HTMLElement {
    models = null
    view = null
    controller = null
    constructor(...args) {
        super()
        const slot = document.createElement('slot')
        const shadow = this.attachShadow({mode: 'open'})
        const style = document.createElement('style')
        style.innerHTML = `
            :host {display: contents}
            ::slotted(model) { display: none }
            ::slotted(scxml) { display: none }
        `
        shadow.appendChild(style)
        shadow.appendChild(slot)

        slot.addEventListener('slotchange', () => {
             const elements = slot.assignedElements()
             const models = Object.fromEntries(
                 elements.filter(e => e.tagName === 'MODEL').map(m => [m.getAttribute('name'), parseModel(m)]))
            debugger
            const scxml = elements.find(e => e.tagName === 'SCXML')
            if (scxml) {
                 const controller = initController(scxml, models, this)
                 console.log({controller})

            }
             console.log(models)
//             elements.forEach(element => {
//                 switch (element.tagName) {
//                     case 'scxml':
// //                        initController({controller: element, host: this})
//                     break;
//                     default:
//                     break;
//                 }
//             })
        })
    }
}

customElements.define('mvc-app', MVC)
customElements.define('mvc-model', MVCModel)