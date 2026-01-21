const { Transform } = require('streamx')
const NewlineDecoder = require('newline-decoder')

function split() {
  const decoder = new NewlineDecoder()
  return new Transform({
    transform(chunk, cb) {
      for (const line of decoder.push(chunk)) {
        this.push(line)
      }
      cb()
    },
    flush(cb) {
      const last = decoder.end()
      if (last) this.push(last)
      cb()
    }
  })
}

module.exports = split
