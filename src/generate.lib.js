/**
 * Used to fetch the JS from Tricount and add our own hooks. This should
 * be run when the Tricount script changes on their end. This is used to create
 * the `fetchTricount.generated.js` file.
 */

const fs = require('fs')
const j = require('jscodeshift')
const path = require('path')

const prologue = fs
  .readFileSync(path.join(__dirname, './prologue.js'))
  .toString()
const request = require('request')

const fetchApplicationSource = () =>
  new Promise(resolve => {
    const url =
      'https://api.tricount.com/com.tribab.tricount.Application/34F0AEDC550E2A5D086804F4E309FE5B.cache.js'
    request.get(url, (err, response) => {
      resolve(response.body)
    })
  })

/**
 * Wraps a list of statements into a function.
 *
 * Used to transform something like
 *
 * ````
 * A()
 * B()
 * C()
 * ```
 *
 * into
 *
 * ```
 * var fnName = function (p1, p2, p3) {
 *   A()
 *   B()
 *   C()
 * }
 * ```
 *
 * @param  {string} fnName - Identifier of the declared function
 * @param  {string[]} paramNames - Identifiers of the arguments
 * @param  {j.Statement[]} statements - Statements for the body of the function
 * @return {j.VariableDeclaration}
 */
const wrapAsFunctionDeclaration = (fnName, paramNames, statements) => {
  return j.variableDeclaration('var', [
    j.variableDeclarator(
      j.identifier(fnName),
      j.functionExpression(
        null,
        paramNames.map(x => j.identifier(x)),
        j.blockStatement(statements)
      )
    )
  ])
}

/**
 * Will transform the normal Tricount script to be usable as a Tricount
 * fetcher.
 *
 * The Tricount script normally fetches the Tricount at the load of the
 * application. The goal of this transformer is to :
 *
 * 1. Provide a home for this script to execute normally. This includes
 * building a fake JSDOM, and setting global variables that are expected
 * by the application
 * 2. Wrap the normal onLoad of the script into a function that we can
 * call it to fetch a Tricount
 *
 * @param  {object} file - Contains the `src` that needs to be transformed
 * @param  {object} api  - Contains `jscodeshift`
 * @return {src}      - Transformed source
 */
const transformer = function(file, api) {
  const j = api.jscodeshift

  const root = j(file.source)
  const program = root.find(j.Program)
  const body = program.nodes()[0].body

  // Provides a home for the script : fake DOM and global variables
  body.unshift(prologue)

  // Add warning and eslint disabler
  body.unshift(`
// THIS FILE IS GENERATED AUTOMATICALLY BY generate.js

/* eslint-disable */`)

  // Now we wrap the onLoad part of the GWT application inside a function, so that
  // we can export it.
  const fnName = 'toExport'

  // The parameters of the exported function
  const tricountKeyIdentifier = 'tricountKey'
  const onSuccessIdentifier = 'onSuccess'
  const onFailureIdentifier = 'onFailure'
  const params = [
    tricountKeyIdentifier,
    onSuccessIdentifier,
    onFailureIdentifier
  ]

  const onloadQuery = { expression: { callee: { name: 'gwtOnLoad' } } }
  root.find(j.ExpressionStatement, onloadQuery).replaceWith(function(path) {
    const functionDeclaration = wrapAsFunctionDeclaration(fnName, params, [
      path.node
    ])

    // Now we add to the body of the function the monkey patching
    // of the Tricount controller.
    const functionBlock = j(functionDeclaration)
      .find(j.BlockStatement)
      .nodes()[0]

    // Replaces the onSuccess/onFailure of the Tricount controller with our methods
    // These methods are passed as callbacks to the exported function.
    functionBlock.body.unshift(`
// Adds the meta tag to control which Tricount is fetched
TricountCommController$1.prototype.onSuccess = function (iResult) {
    ${onSuccessIdentifier}(iResult)
}

TricountCommController$1.prototype.onFailure = function (iResult) {
    ${onFailureIdentifier}(iResult)
}
    `)

    // At runtime, inserts the meta tag that the app uses to identifies the Tricount
    functionBlock.body.unshift(`
const document = dom.window.document
const meta = document.createElement('meta')
meta.setAttribute('name', 'gwt:property')
meta.setAttribute('id', 'tricount:key')
meta.setAttribute('content', ${tricountKeyIdentifier})
document.querySelector('head').appendChild(meta)
    `)

    return functionDeclaration
  })

  // Do not issue warning about user agents
  root
    .find(j.FunctionDeclaration, { id: { name: 'assertCompileTimeUserAgent' } })
    .replaceWith(function() {
      return 'function assertCompileTimeUserAgent() {}'
    })

  body.push(`module.exports = ${fnName}`)

  return root.toSource()
}

module.exports = {
  fetchApplicationSource,
  transformer
}
