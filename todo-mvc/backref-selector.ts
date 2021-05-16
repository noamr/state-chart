type BackRefResult = {[key: string]: string} | null
export type BackRefMatcher = (e: Element) => BackRefResult

interface Part {
    selector: string
    extract: (e: Element) => {[key: string]: string}
}

export default function matchSelectorWithBackRefs(selectors: string): BackRefMatcher {
    const regex = /(?<pred>[^\s]*)(\[(?<attrName>[A-Za-z0-9_-]+)\=\{(?<attrValue>[^\}]+\})\]|(?<partQualifier>[.#:])\{(?<partValue>[^}]+)\})/g
    const result = selectors.matchAll(regex)
    if (!result)
        return (target: Element) => target.matches(selectors) ? {} : null

    let parts: Part[] = []
    const DefaultExtract = (e: Element) => ({})
    let cursor = 0
    for (const {index, 0: input, groups} of result) {
        if (index && index > cursor)
            parts.push({selector: selectors.substr(cursor, index), extract: DefaultExtract})

        cursor = (index || 0) + input.length

        if (!index || !groups) {
            parts.push({selector: input, extract: e => ({})})
            continue
        }

        let selector = groups.pred || '*'
        let extract = DefaultExtract

        if (groups.partQualifier && groups.partValue) {
            switch (groups.partQualifier) {
                case '#':
                    selector += '[id]'
                    extract = e => ({[groups.partValue]: e.id})
                    break
                case ':':
                    extract = e => ({[groups.partValue]: e[groups.partValue as keyof Element]})
                    break
                case '.':
                    selector += '[class]'
                    extract = e => ({[groups.partValue]: e.className})
                    break
            }
        } else if (groups.attrName && groups.attrValue) {
            selector += `[${groups.attrName}]`
            extract = (e: Element) => ({[groups.attrValue]: e.getAttribute(groups.attrName)})
        }

        parts.push({selector, extract})
    }

    if (cursor < selectors.length)
        parts.push({selector: selectors.substr(cursor), extract: DefaultExtract})

    return (e: Element) => {
        const res = parts.reduce((agg, part) => {
            if (!agg)
                return null
            const next = agg.context.querySelector(part.selector)
            if (!next)
                return null
            
            Object.assign(agg.result, part.extract(next))
            return {context: next, result: {...agg.result, ...part.extract(next)}}
        }, {context: e, result: {} } as {context: Element, result: BackRefResult} | null)

        return res && res.result
    }
}