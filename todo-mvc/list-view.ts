
class ListView extends HTMLElement {
    get observedAttributes() { return ['model'] }
    constructor() {
        super()
        const shadow = this.attachShadow({mode: 'closed'})
        const style = document.createElement('style')
        style.innerHTML = ':host { display: contents }'
        const slot = document.createElement('slot')
        slot.setAttribute('name', 'list')
        slot.addEventListener('slotchange', () => {
            const elements = slot.assignedElements()
            if (elements.length)
                this.init(elements[0] as HTMLElement, this.querySelector('template') as HTMLTemplateElement)
        })
        shadow.appendChild(slot)
        shadow.appendChild(style)                
    }

    init(listContainer: HTMLElement, itemTemplate: HTMLTemplateElement) {
        const model = document.querySelector(this.getAttribute('model') as string)
        if (!model)
            return

        const items: Map<string, {value: ListModelValue, element: HTMLElement}> = new Map()

        function populate(form: HTMLFormElement, value: ListModelValue, key: string) {
            form.dataset.key = key
            for (const [k, v] of value.entries()) {
                const input = form.elements.namedItem(k) as HTMLInputElement | RadioNodeList
                if (input instanceof HTMLInputElement && input.type === 'checkbox')
                    (input as HTMLInputElement).checked = !!v
                else
                    input.value = v as string
            }
        }

        model.addEventListener('insert', (e: Event) => {
            const {ref, key, value, position} = e as InsertEvent
            const refElement = ref ? items.get(ref) : null
            const newElement = (itemTemplate.content.cloneNode(true) as HTMLElement).firstElementChild as HTMLFormElement
            items.set(key, {element: newElement, value})
            if (refElement && position)
                refElement.element.insertAdjacentElement(position, newElement)
            else
                listContainer.appendChild(newElement)

            populate(newElement, value, key)
        })

        model.addEventListener('delete', (e: Event) => {
            const {key} = e as DeleteEvent
            const element = items.get(key)
            if (!element)
                return

            items.delete(key)
            element.element.remove()
        })

        model.addEventListener('update', (e: Event) => {
            const {key, newValue} = e as UpdateEvent
            const element = items.get(key)
            if (!element)
                return

            element.value = newValue
            populate(element.element as HTMLFormElement, newValue, key)
        })

        model.addEventListener('filter', (e: Event) => {
            const {filter} = e as FilterEvent
        })
    }
}
customElements.define('list-model', ListModel)
customElements.define('list-view', ListView)