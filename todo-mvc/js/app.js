function mvc({host, controller}) {
}
class MVCModel extends HTMLElement {
  constructor() {
    super(...arguments);
    const slot = document.createElement("slot");
    const shadow = this.attachShadow({mode: "open"});
    shadow.appendChild(slot);
    const fields = new Map();
    slot.addEventListener("slotchange", (e) => {
      const elements = slot.assignedElements();
      for (const el of elements) {
        switch (e.tagName) {
          case "field": {
            const name = e.getAttribute("name");
            const defaultValue = e.textContent;
            const type = e.getAttribute("type");
            const getDefault = defaultValue === ":uuid:" ? uuid() : () => defaultValue;
            fields.set(name, {type, getDefault});
            break;
          }
          case "filter": {
            const name = e.getAttribute("name");
            const defaultValue = e.textContent;
            const type = e.getAttribute("type");
            const getDefault = defaultValue === ":uuid:" ? uuid() : () => defaultValue;
            fields.set(name, {type, getDefault});
            break;
          }
          case "aggregate":
            break;
        }
      }
    });
  }
}
class MVC extends HTMLElement {
  constructor(...args) {
    super();
    this.models = null;
    this.view = null;
    this.controller = null;
    const slot = document.createElement("slot");
    const shadow = this.attachShadow({mode: "open"});
    const style = document.createElement("style");
    style.innerHTML = `
            :host {display: contents}
            ::slotted(model) { display: none }
            ::slotted(scxml) { display: none }
        `;
    shadow.appendChild(style);
    shadow.appendChild(slot);
    slot.addEventListener("slotchange", (e) => {
    });
  }
}
customElements.define("mvc-app", MVC);
customElements.define("mvc-model", MVCModel);
