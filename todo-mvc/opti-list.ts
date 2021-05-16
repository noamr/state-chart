import {InvisibleElement, assert} from './common'

type ListFilter = {[key: string]: string | number | RegExp}
type ListModelValue = {[key: string]: string | null}

interface SubmitEvent extends Event {
  submitter: HTMLElement; 
}

type ModelMethod = 'POST' | 'PUT' | 'DELETE' | 'GET'
type SortOrder = 'DESC' | 'ASC'
type Sort = Array<[string, SortOrder]>

class ModelEvent extends Event {
    method: ModelMethod
    path: string
    data: FormData | null
    constructor({method, path, data}: {method: ModelMethod, path: string, data?: FormData}) {
        super('rest')
        this.method = method
        this.path = path
        this.data = data || null
    }
}

class OptiListItem extends HTMLElement {
    private observer: MutationObserver

    constructor() {
        super()
        const shadow = this.attachShadow({mode: 'closed'})
        const form = shadow.querySelector('form')
        this.observer = new MutationObserver(this.populate)
        this.observer.observe(this, {attributes: true})
    }

    private populate () {
        const parent = this.parentElement as HTMLElement
        const form = assert(this.shadowRoot).querySelector('form')
        if (!form)
            return
        form.action = `#${parent.id}/${this.id}`
        for (const [k, v] of Object.entries(this.dataset)) {
            const input = form.elements.namedItem(k) as HTMLInputElement | RadioNodeList
            if (!input)
                continue
            if (input instanceof HTMLInputElement && input.type === 'checkbox')
                (input as HTMLInputElement).checked = v === 'true'
            else
                input.value = v as string
        }
    }

    connectedCallback() {
        const parent = this.parentElement as HTMLElement
        const template = parent.querySelector('template') as HTMLTemplateElement
        assert(this.shadowRoot).appendChild(template.content.cloneNode(true))
        this.populate()
    }

    disconnectedCallback() {
        if (this.observer)
            this.observer.disconnect()
    }
}

class OptiList extends HTMLElement {
    private dataElement: HTMLElement = this
    private itemTemplate: HTMLTemplateElement | null = null
    get order() { return this.getAttribute('order') || '' }
    set order(s: string) { this.setAttribute('order', s) }
    get filter() { return this.getAttribute('filter') || '*' }
    set filter(f: string) { this.setAttribute('filter', f) }
    get data() { return this.dataElement }

    get itemType() { return this.getAttribute('item-type') || 'opti-item'}


    private applyFilter(oldValue: string, newValue: string) {
        for (const e of this.dataElement.querySelectorAll(`${this.itemType}[hidden]:where(${newValue})`))
            e.hidden = false
        for (const e of this.dataElement.querySelectorAll(`${this.itemType}:not([hidden]):not(${newValue})`))
            e.hidden = true
    }

    private applySort(oldValue: string, newValue: string) {
        if (!newValue)
            return

        const sortSpec = newValue.split(',').map(s => s.split(':')) as Sort
        const compare = (a: HTMLElement, b: HTMLElement) => {
            let diff = 0
            for (const [key, order] of sortSpec) {
                const v1 = a.dataset[key] || ''
                const v2 = b.dataset[key] || ''
                diff = order === 'DESC' ? v2.localeCompare(v1) : v1.localeCompare(v2)
                if (diff)
                    return diff
            }

            return 0
        }

        ([...this.dataElement.querySelectorAll(this.itemType)] as HTMLElement[])
            .sort(compare)
            .forEach(e => this.dataElement.appendChild(e))
    }

    static get observedAttributes() { return ['filter', 'order', 'persist']}

    private async persist() {
        const persist = this.getAttribute('persist') || ''
        const src = this.getAttribute('src')

        if (!persist && !src)
            return

        let [dbName, storeName] = (this.getAttribute('persist') as string).split(':')
        storeName = storeName || dbName
        if (!dbName)
            return
        const database = await new Promise<IDBDatabase>((resolve, rej) => {
            const req = window.indexedDB.open(dbName, 2) as IDBRequest<IDBDatabase>
            req.addEventListener('error', rej)
            req.addEventListener('success', () => resolve(req.result as IDBDatabase))
            req.addEventListener('upgradeneeded', () => { req.result.createObjectStore(storeName, { }) })
        })

        if (database) {
            const store = database.transaction([dbName], 'readonly').objectStore(storeName) as IDBObjectStore
            store.openCursor().addEventListener('success', e=> {
                const cursor = (e.target as any).result as IDBCursorWithValue
                if (cursor)
                    this.replace(`#${cursor.key}`, cursor.value, {synced: true})
            })
        }


        const updateObserver = new MutationObserver(async records => {
            const tx = database.transaction([storeName], 'readwrite')
            const store = tx.objectStore(storeName)
            records.forEach(r => {
                const element = (r.target as HTMLElement)
                store.put(element.dataset, element.id)
            })
        })

        const addDeleteObserver = new MutationObserver(async records => {
            const store = database.transaction([storeName], 'readwrite').objectStore(storeName)
            records.forEach(record => {
                record.removedNodes.forEach(n => {
                    if (n.nodeType !== Node.ELEMENT_NODE)
                        return
                    const e = n as HTMLElement
                    if (e.tagName === this.itemType)
                        store.delete(e.id)
                })

                record.addedNodes.forEach(n => {
                    if (n.nodeType !== Node.ELEMENT_NODE)
                        return
                    const e = n as HTMLElement

                    if (e.hasAttribute('synced'))
                        return

                    store.add(e.dataset, e.id)
                    e.setAttribute('synced', 'true')
                    
                    updateObserver.observe(e, {attributes: true})
                })
            })
        })

        addDeleteObserver.observe(this.dataElement, {childList: true})
    }

    connectedCallback() {
        if (this.hasAttribute('filter'))
            this.applyFilter('*', this.getAttribute('filter') || '*')
        if (this.hasAttribute('order'))
            this.applyFilter('', this.getAttribute('order') || '')
        if (this.hasAttribute('persist') || this.hasAttribute('src'))
            this.persist()

        this.ownerDocument.addEventListener('submit', (ev: Event) => {
            const {submitter} = ev as SubmitEvent
            const form = ev.target as HTMLFormElement
            const action = submitter && submitter.hasAttribute('formaction') ? submitter.getAttribute('formaction') : form.action
            if (!action)
                return
                
            const method = ((submitter && submitter.hasAttribute('formmethod') ? submitter.getAttribute('formmethod') : form.method) || 'GET')
                .toUpperCase() as ModelMethod

            const match = action.match(`\#(?<id>[A-Za-z-_]+)(?<path>[/?].+)?`)
            if (!match || !match.groups)
                return

            const {path, id} = match.groups
            if (id !== this.getAttribute('id'))
                return

            ev.preventDefault()

            const data = new FormData(form)
            const event = new ModelEvent({method, data, path})
            this.dispatchEvent(event)
        }, {capture: true})
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        switch (name) {
            case 'filter':
                this.applyFilter(oldValue, newValue)
                break

            case 'order':
                this.applySort(oldValue, newValue)
                break
            case 'persist':
                this.persist()
                break
        }
    }

    private updateElement(value: ListModelValue, {dataset}: HTMLElement) {
        Object.entries(value).forEach(([key, v]) => {
            if (v === null)
                delete dataset[key]
            else
                dataset[key] = v as string
        })
    }

    replace(filter: string, value: ListModelValue, additionalAttributes: {[key: string]: any} = {}) {
        const found = this.data.querySelectorAll(`${this.itemType}:where(${filter})`)
        for (const e of found) {
            const element = e as HTMLElement
            for (const k in element.dataset)
                delete element.dataset[k]
            for (const a in additionalAttributes)
                element.setAttribute(a, additionalAttributes[a])
            this.updateElement(value, element)
        }

        const idMatch = filter.match(/\#(?<id>[A-Za-z0-9\-_.]+)/)

        if (!found.length && idMatch && idMatch.groups) {
            const newElement = document.createElement(this.itemType)
            newElement.id = idMatch.groups.id
            this.updateElement(value, newElement)
            this.data.appendChild(newElement)
        }
    }

    update(filter: string, value: ListModelValue) {
        Array.from(this.data.querySelectorAll(`${this.itemType}:where(${filter})`))
            .forEach(e => this.updateElement(value, e as HTMLElement))
    }

    delete(filter: string) {
        Array.from(this.data.querySelectorAll(`${this.itemType}:where(${filter})`)).forEach(e => e.remove())
    }

    constructor() {
        super()
        const shadow = this.attachShadow({mode: 'open'})
        const slot = document.createElement('slot') as HTMLSlotElement
        const style = document.createElement('style')
        style.innerHTML = ':host {display: contents}'
        shadow.appendChild(slot)
        shadow.appendChild(style)

        slot.addEventListener('slotchange', () => {
            slot.assignedElements().forEach(e => {
                if (e.tagName === 'TEMPLATE')
                    this.itemTemplate = e as HTMLTemplateElement
                else
                    this.dataElement = e as HTMLElement
            })
        })

        this.addEventListener('model', (ev: Event) => {
            const {method, path} = ev as ModelEvent
            const data = (ev as ModelEvent).data || new FormData()
            const query = new URL(path).searchParams
            const filter = query.get('filter') || (path ? `#${path}` : '*')
            const value = new Map([...data.keys()].map(k => [k, data.get(k)]))

            switch (method.toUpperCase()) {
                case 'GET':
                    this.filter = filter
                    this.order = query.get('sort') || ''
                    break
                case 'PUT':
                    this.update(filter, value)
                    break
                case 'POST':
                    this.replace(filter, value)
                    break
                case 'DELETE':
                    this.delete(filter)
                    break
            }
        })
    }
}

customElements.define('opti-list', OptiList)
customElements.define('opti-item', OptiListItem)
