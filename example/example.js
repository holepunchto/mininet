const Mininet = require('../')
const mn = new Mininet()

const s1 = mn.createSwitch()
const h1 = mn.createHost()
const h2 = mn.createHost()

h1.link(s1)
h2.link(s1)

mn.start(function () {
  console.log('mininet started')
})

h1.spawn('node server.js', { stdio: 'inherit' }).on('message:listening', function () {
  console.log('started', h1.ip)

  h2.spawn('node client.js ' + h1.ip, {
    stdio: 'inherit'
  })

  setTimeout(() => {
    mn.stop()
  }, 5000)
})

process.on('SIGINT', function () {
  mn.stop()
})
