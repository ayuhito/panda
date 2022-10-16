import { capitalize, dashCase } from '@css-panda/shared'
import type { PatternConfig } from '@css-panda/types'
import { outdent } from 'outdent'
import type { PandaContext } from '../../context'

function generate(name: string, pattern: PatternConfig, jsxFactory: string) {
  const upperName = capitalize(name)
  const jsxName = pattern.jsx ?? upperName

  const keys = Object.keys(pattern.properties ?? {})
  return {
    name: dashCase(name),
    js: outdent`
    import { forwardRef } from 'preact/compat'
    import { ${jsxFactory} } from './factory'
    import { config } from '../patterns/${dashCase(name)}'

    export const ${jsxName} = forwardRef(function ${jsxName}(props, ref) {
      const { ${keys.join(', ')}, ...restProps } = props
      const styleProps = config.transform({${keys.join(', ')}})
      return <${jsxFactory}.div ref={ref} {...styleProps} {...restProps} />
    })    
    `,

    dts: outdent`
    import { ComponentProps, JSX, ComponentChildren } from 'preact';
    import { ${upperName}Options } from '../patterns/${name}'
    import { CssObject } from '../types'
    
    type ElementType = keyof JSX.IntrinsicElements
    type PropsWithChildren<T> = T & { children?: ComponentChildren }

    type Merge<T, U> = Omit<T, keyof U> & U
    type PropsOf<C extends ElementType> = ComponentProps<C>
    type StyleProps = CssObject & { css?: CssObject }
    
    type Polymorphic<C extends ElementType = 'div', P = {}> = StyleProps &
      Merge<PropsWithChildren<PropsOf<C>>, P & { as?: C; color?: string }>

    type ${jsxName}Props<C extends ElementType> = Polymorphic<C, ${upperName}Options>
    
    export declare function ${jsxName}<V extends ElementType>(props: ${jsxName}Props<V>): JSX.Element    
    `,
  }
}

export function generatePreactJsxPattern(ctx: PandaContext) {
  if (!ctx.hasPattern) return []
  return Object.entries(ctx.patterns).map(([name, pattern]) => generate(name, pattern, ctx.jsxFactory))
}
