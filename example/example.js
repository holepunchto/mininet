const mininet = require('../')
const mn = mininet()

const s1 = mn.createSwitch()
const h1 = mn.createHost()
const h2 = mn.createHost()

h1.link(s1)
h2.link(s1)

mn.start(function () {
  console.log('mininet started')
})

h1.spawn('node server.js', { stdio: 'inherit' }).on('message:listening', function () {
  h2.spawn('curl --silent ' + h1.ip + ':10000', {
    stdio: 'inherit'
  })
})

process.on('SIGINT', function () {
  mn.stop()
})
