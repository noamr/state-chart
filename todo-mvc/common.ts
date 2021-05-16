export class InvisibleElement extends HTMLElement {
    init(elements: Element[]) { }

    constructor() {
        super()
        const shadow = this.attachShadow({mode: 'open'})
        const style = document.createElement('style')
        style.innerHTML = ':host { display: none }'
        const slot = document.createElement('slot')
        slot.addEventListener('slotchange', () => {
            this.init(slot.assignedElements())
        })
        shadow.appendChild(slot)
        shadow.appendChild(style)                
    }
}

export function assert<T>(t?: T | null): T {
    if (typeof t === 'undefined' || t === null)
        throw new Error(`Expected ${t} to not be nil`)

    return t
}
