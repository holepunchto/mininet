const { Transform } = require('streamx')
const { StringDecoder } = require('string_decoder')

const matcher = /\r?\n/

function split() {
  let last = ''
  const decoder = new StringDecoder('utf8')

  return new Transform({
    transform(chunk, cb) {
      last += decoder.write(chunk)

      const list = last.split(matcher)
      last = list.pop()

      for (const item of list) {
        if (item !== undefined) this.push(item)
      }

      cb()
    },

    flush(cb) {
      last += decoder.end()
      if (last) {
        if (item !== undefined) this.push(item)
      }
      cb()
    }
  })
}

module.exports = split
