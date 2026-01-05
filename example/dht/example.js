const Mininet = require('../../')
const mn = new Mininet()

const s1 = mn.createSwitch()
const h1 = mn.createHost()
const h2 = mn.createHost()
const h3 = mn.createHost()

h1.link(s1)
h2.link(s1)
h3.link(s1)

mn.start(function () {
  console.log('mininet started')
})

console.log('starting')

h1.spawn('node dht.js', { stdio: 'inherit' }).on('message:listening', function () {
  console.log('started', h1.ip)
  h2.spawn('node client.js ' + h1.ip, {
    stdio: 'inherit'
  })

  // TODO: should should find the results without creating any data
  h3.spawn('node client.js ' + h1.ip + ' skip', {
    stdio: 'inherit'
  })
})

// Better signal handling
let stopping = false
function cleanup() {
  if (stopping) return
  stopping = true
  console.log('\nCleaning up...')
  mn.stop(function () {
    process.exit(0)
  })
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

// Cleanup on uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  cleanup()
})
