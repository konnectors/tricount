const jscodeshift = require('jscodeshift')
const { transformer } = require('./generate.lib')

describe('tricount transformer', () => {
  it('should transform the tricount script so that it can be used as a fetcher', () => {
    const source = `

      blabla()
      gwtStuff()

      gwtOnLoad()

      afterGwtLoad()
    `

    const transformed = transformer({ source }, { jscodeshift })

    expect(transformed).toMatchSnapshot()
  })
})
