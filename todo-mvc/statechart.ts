import {InvisibleElement} from './common'
import {ScxmlAlgorithm} from './scxml-impl'
import startScxmlDOM from './scxml-dom'

class StateChart extends InvisibleElement {
    algo?: ScxmlAlgorithm
    constructor() {
        super()
    }

    init(elements: Element[]) {
        const scxml = elements[0]
        this.algo = startScxmlDOM(elements[0], () => this.ownerDocument.querySelector('.todoapp'))
    }

    disconnectedCallback() {
        if (this.algo)
            this.algo.terminate()
    }
}

customElements.define('state-chart', StateChart)
