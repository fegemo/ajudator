#!/usr/bin/env node

import { promises as fs } from "fs";
import * as acorn from "acorn";

const ACORN_OPTIONS = {
  ecmaVersion: '2020',
  sourceType: 'module'
}
const NODE_WEIGHT = '__nodeWeight__'

const fileNames = process.argv.slice(2)
try {
  const readPromises = fileNames.map(name => fs.readFile(name, 'utf-8'))
  const contents = await Promise.all(readPromises)

  try {
    const asts = contents.map(content => acorn.parse(content, ACORN_OPTIONS))
    // fs.writeFile('ast-a.json', JSON.stringify(asts[i], null, 2))
    // fs.writeFile('ast-b.json', JSON.stringify(asts[j], null, 2))

    try {
      const reports = []
      const comparisonDivergences = []
      for (let i = 0; i < asts.length; i++) {
        for (let j = i+1; j < asts.length; j++) {
          const comparisonAB = compare(asts[i], asts[j])
          const comparisonBA = compare(asts[j], asts[i])
          const comparisons = [comparisonAB, comparisonBA]

          const source = clipText(fileNames[i])
          const target = clipText(fileNames[j])
          const report = {
            source,
            target
          }

          comparisonDivergences.push(comparisonAB.divergences)
          if (comparisons.reduce((prev, curr) => prev + curr.divergences.length, 0) === 0) {
            report.identical = true
            report.result = 'Identical'
            report.disparityWIP = Number(0).toFixed(4)
          } else {
            report.identical = false
            report.result = `${comparisons.map(c => c.divergences.length)} divergences`
            const disparityAB = Math.max(...comparisonAB.divergences.map(div => div.weight)) / asts[0][NODE_WEIGHT]
            const disparityBA = Math.max(...comparisonBA.divergences.map(div => div.weight)) / asts[1][NODE_WEIGHT]
            report.disparityWIP = ((disparityAB + disparityBA) / 2).toFixed(4)
            // report.disparity = `${(comparison.divergences.reduce((prev, curr) => prev + curr.weight, 0) / comparison.sumOfWeights).toFixed(4)}`
          }
          reports.push(report)
        }
      }

      // show report
      console.table(reports)
      // show divergences
      for (let i = 0; i < reports.length; i++) {
        const report = reports[i]
        const divergences = comparisonDivergences[i]
        if (divergences.length > 0) {
          console.log(`Divergences between: ${report.source} x ${report.target}:`)
          divergences.forEach(div => {
            console.log(`  - In ${div.path}: ${div.message}`)
          })
        }
      }

    } catch (error) {
      console.error(`Error comparing ASTs of ${fileNames}:`, error)
    }

  } catch (error) {
    console.error(`Error generating ASTs`, error)
  }

} catch (error) {
  console.error(`Error reading files: ${fileNames}`, error);
}


function clipText(text, maxLength = 30, ellipsis = '...') {
  if (text.length > maxLength) {
    const beginSize = Math.floor((maxLength - ellipsis.length) / 2)
    const endSize = maxLength - ellipsis.length - beginSize
    text = text.substr(0, beginSize) + ellipsis + text.substr(text.length - endSize - 1)
  }
  return text
}


function compare(a, b, options) {
  const ignorePropertyValueDivergence = [
    'value',
    'raw',
    'name'
  ]
  const ignorePropertyEntirely = [
    'start',
    'end',
    'sourceType',
    NODE_WEIGHT  // property created here which counts descendants
  ]



  determineWeights(a)
  determineWeights(b)

  const sumOfWeights = getSumOfWeights(a)

  return {
    divergences: [...compareNode(a, b, 'root')],
    sumOfWeights
  }


  function getSumOfWeights(node) {
    let sum =  0
    if (node instanceof Object && node !== null) {
      sum = node[NODE_WEIGHT] ?? 0
      for (let prop of Object.keys(node)) {
        if (Array.isArray(node[prop])) {
          for (let i = 0; i < node[prop].length; i++) {
            sum += getSumOfWeights(node[prop][i])
          }
        } else {
          sum += getSumOfWeights(node[prop])
        }
      }
    }
    return sum
  }

  function determineWeights(node) {
    let weight = 1

    if (node instanceof Object && node !== null) {
      for (let prop of Object.keys(node)) {
        if (Array.isArray(node[prop])) {
          for (let el of node[prop]) {
            weight += determineWeights(el)
          }
        } else {
          weight += determineWeights(node[prop])
        }
      }
    } else {
      return 0
    }

    node[NODE_WEIGHT] = weight
    return weight
  }

  function compareNode(a, b, path) {
    const divergences = []

    if (!ensureObjects(a, b, path, divergences)) {
      return divergences
    }

    // pega propriedades de a e b
    let [aProps, bProps] = [a, b].map(o => Object.keys(o));
    // exclui propriedades totalmente ignoradas
    [aProps, bProps] = [aProps, bProps].map(props => props.filter(prop => !ignorePropertyEntirely.includes(prop)))
    // visita as propriedades de a
    for (let prop of aProps) {
      ensureExistence(a, b, prop, path, divergences)

      // ignorar valor desta propriedade?
      const shouldIgnoreValue = ignorePropertyValueDivergence.includes(prop)
      switch (typeof a[prop]) {
        case 'boolean':
        case 'number':
        case 'string':
          ensureEqualValue(a, b, prop, path, divergences, shouldIgnoreValue)
          break
        case 'object':
          if (a[prop] === null) {
            ensureEqualValue(a, b, prop, path, divergences, shouldIgnoreValue)
          }
          else if (Array.isArray(a[prop]) || Array.isArray(b[prop])) {
            // property is an array
            const bothArrays = ensureArrays(a, b, prop, path, divergences)
            if (bothArrays) {
              const size = ensureArraysSameSize(a, b, prop, path, divergences)
              for (let i = 0; i < size; i++) {
                divergences.push(...compareNode(a[prop][i], b[prop][i], `${path}.${prop}[${i}]`))
              }
            }
          }
          else {
            // plain object
            divergences.push(...compareNode(a[prop], b[prop], `${path}.${prop}`))
          }
          break
      }
    }
    
    return divergences
  }

  function ensureObjects(a, b, path, divergences) {
    const howManyObjects = [a, b].reduce((prev, curr) => prev + (curr instanceof Object ? 1 : 0), 0)
    const allObjects = howManyObjects === [a, b].length
    if (!allObjects) {
      divergences.push({
        path,
        valueA: a,
        valueB: b,
        message: `Trying to compare nodes, but only ${howManyObjects} were plain objects.`,
        weight: a[NODE_WEIGHT]
      })
    }
    return allObjects
  }

  function ensureEqualValue(a, b, prop, path, divergences, shouldIgnoreValue) {
    const hasDivergence = !shouldIgnoreValue && a[prop] !== b[prop]
    if (hasDivergence) {
      divergences.push({
        path: `${path}.${prop}`,
        valueA: a[prop],
        valueB: b[prop],
        message: `Different values of property ${prop}: ${a[prop]} and ${b[prop]}.`,
        weight: a[NODE_WEIGHT]
      })
    }
    return hasDivergence
  }

  function ensureArrays(a, b, prop, path, divergences) {
    const howManyArrays = [a[prop], b[prop]].reduce((prev, curr) => prev + (Array.isArray(curr) ? 1 : 0), 0)
    const allArrays = howManyArrays === [a, b].length
    if (!allArrays) {
      divergences.push({
        path: `${path}.${prop}`,
        valueA: a[prop],
        valueB: b[prop],
        message: `Both should be arrays, but only ${howManyArrays} was.`,
        weight: a[NODE_WEIGHT]
      })
    }
    return allArrays
  }

  function ensureArraysSameSize(a, b, prop, path, divergences) {
    const howManyElements = [a[prop], b[prop]].map(arr => arr.length)
    const sameSize = howManyElements.reduce((prev, curr) => prev && curr.length === a.length, true)
    if (!sameSize) {
      divergences.push({
        path: `${path}.${prop}`,
        valueA: a[prop],
        valueB: b[prop],
        message: `Arrays should have the same size, but they had: ${howManyElements}.`,
        weight: a[NODE_WEIGHT]
      })
    }
    return Math.min(...howManyElements)
  }

  function ensureExistence(a, b, prop, path, divergences) {
    const howManyHasProp = [a, b].reduce((prev, curr) => prev + (curr.hasOwnProperty(prop) ? 1 : 0), 0)
    const allHaveProp = howManyHasProp === [a, b].length
    if (!allHaveProp) {
      divergences.push({
        path: `${path}.${prop}`,
        valueA: a[prop],
        valueB: b[prop],
        message: `Both objects should have property ${prop}, but only ${howManyHasProp} had.`,
        weight: a[NODE_WEIGHT]
      })
    }
    return allHaveProp
  }
}

