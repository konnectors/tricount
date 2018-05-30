/* eslint-disable no-console */

const fs = require('fs')
const { transformer, fetchApplicationSource } = require('./generate.lib')
const j = require('jscodeshift')

const main = async () => {
  console.log('Fetching application script...')
  const tricountAppSource = await fetchApplicationSource()
  fs.writeFileSync('/tmp/tricount.js', tricountAppSource)
  console.log('Transforming..')
  const transformed = transformer(
    {
      source: fs.readFileSync('/tmp/tricount.js').toString()
    },
    {
      jscodeshift: j
    }
  )
  fs.writeFileSync('./fetchTricount.generated.js', transformed)
}

main()
