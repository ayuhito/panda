import {
  type Stylesheet,
  expandNestedCss,
  extractParentSelectors,
  optimizeCss,
  prettifyCss,
  toCss,
} from '@pandacss/core'
import postcss, { AtRule, Rule } from 'postcss'
import type { Context } from '../../engines'

export function generateTokenCss(ctx: Context, sheet?: Stylesheet) {
  const { conditions, tokens } = ctx

  const cssVarRoot = ctx.config.cssVarRoot!

  const results: string[] = []

  for (const [key, values] of tokens.vars.entries()) {
    const varsObj = Object.fromEntries(values)
    if (Object.keys(varsObj).length === 0) continue

    if (key === 'base') {
      const { css } = toCss({ [cssVarRoot]: varsObj })
      results.push(css)
    } else {
      // nested conditionals in semantic tokens are joined by ":", so let's split it
      const keys = key.split(':')
      const { css } = toCss(varsObj)

      const mapped = keys
        .map((key) => conditions.get(key))
        .filter(Boolean)
        .map((condition) => {
          const parent = extractParentSelectors(condition)
          // ASSUMPTION: the nature of parent selectors with tokens is that they're merged
          // [data-color-mode=dark][data-theme=pastel]
          // If we really want it nested, we remove the `&`
          return parent ? `&${parent}` : condition
        })

      const rule = getDeepestRule(cssVarRoot, mapped)
      if (!rule) continue

      getDeepestNode(rule)?.append(css)
      results.push(expandNestedCss(rule.toString()))
    }
  }

  const css = cleanupSelectors(results.join('\n\n'), cssVarRoot)
  if (sheet) {
    sheet.getLayer('tokens')?.append(css)
    return
  }

  const output = optimizeCss(
    `@layer ${ctx.layers.name.tokens} {
      ${prettifyCss(css)}
    }
    `,
    { minify: ctx.config.minify },
  )

  void ctx.hooks.callHook('generator:css', 'tokens.css', output)
  return output
}

function getDeepestRule(root: string, selectors: string[]) {
  const rule = postcss.rule({ selector: '' })

  for (const selector of selectors) {
    const last = getDeepestNode(rule)
    const node = last ?? rule
    if (selector.startsWith('@')) {
      // ASSUMPTION: the nature of parent selectors with tokens is that they're merged
      // [data-color-mode=dark][data-theme=pastel]
      // If we really want it nested, we remove the `&`
      const atRule = postcss.rule({ selector, nodes: [postcss.rule({ selector: `${root}&` })] })
      node.append(atRule)
    } else {
      node.append(postcss.rule({ selector }))
    }
  }

  return rule
}

function getDeepestNode(node: AtRule | Rule): Rule | AtRule | undefined {
  if (node.nodes && node.nodes.length) {
    return getDeepestNode(node.nodes[node.nodes.length - 1] as AtRule | Rule)
  }
  return node
}

export function cleanupSelectors(css: string, varSelector: string) {
  const root = postcss.parse(css)

  root.walkRules((rule) => {
    // [':root', ' :host,', '  ::backdrop ']
    const selectors = [] as string[]
    rule.selectors.forEach((selector) => {
      selectors.push(selector.trim())
    })

    // ':root, :host, ::backdrop'
    const ruleSelector = selectors.join(', ')
    if (ruleSelector === varSelector) {
      return
    }

    // ':root,:host,::backdrop'
    const trimmedSelector = selectors.join(',')
    if (trimmedSelector === varSelector) {
      return
    }

    const selectorsWithoutVarRoot = selectors
      .map((selector) => {
        const res = selector.split(varSelector).filter(Boolean)
        return res.join('')
      })
      .filter(Boolean)
    if (selectorsWithoutVarRoot.length === 0) return
    rule.selector = selectorsWithoutVarRoot.join(', ')
  })

  return root.toString()
}
