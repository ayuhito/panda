import { minifyConfig } from '@css-panda/ast'
import { logger } from '@css-panda/logger'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { bundleConfigFile } from './bundle-config'
import { findConfigFile } from './find-config'
import { loadBundledFile } from './load-bundled-config'
import { normalizePath } from './normalize-path'

const dynamicImport = new Function('file', 'return import(file)')

type ConfigFileOptions = {
  root: string
  file?: string
}

export async function loadConfigFile<T extends Record<string, any> = Record<string, any>>(options: ConfigFileOptions) {
  const { root, file } = options

  const { isESM, filepath } = findConfigFile({ root, file }) ?? {}

  logger.debug({ type: 'config', isESM, filepath })

  logger.info({ type: 'config', msg: `Found config file at: \n${filepath}` })

  if (!filepath) return {}

  const bundled = await bundleConfigFile(filepath, isESM)

  logger.info({ type: 'config', msg: 'Bundled Config File' })

  const dependencies = bundled.dependencies ?? []

  const fileName = filepath
  let config: T

  if (isESM) {
    const fileBase = `${fileName}.timestamp-${Date.now()}`
    const fileNameTmp = `${fileBase}.mjs`

    fs.writeFileSync(fileNameTmp, bundled.code)

    try {
      const fileUrl = `${pathToFileURL(fileBase)}.mjs`
      config = (await dynamicImport(fileUrl)).default
    } finally {
      try {
        fs.unlinkSync(fileNameTmp)
      } catch {
        // already removed if this function is called twice simultaneously
      }
    }
  } else {
    config = await loadBundledFile(fileName, bundled.code)
  }

  if (typeof config !== 'object') {
    throw new Error(`💥 config must export or return an object.`)
  }

  return {
    path: filepath,
    config,
    dependencies: dependencies.map((dep) => normalizePath(path.resolve(dep))),
    code: bundled.code,
    minifiedCode: minifyConfig(bundled.code),
  }
}

export type LoadConfigResult<T> = {
  path: string
  config: T
  dependencies: string[]
  code: string
  minifiedCode: string
}
