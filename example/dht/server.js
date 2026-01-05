const DHT = require('hyperdht')
const mn = require('../../host')

async function main() {
  const node = DHT.bootstrapper(49737, '127.0.0.1')

  await node.fullyBootstrapped().then(function () {
    console.log('Bootstrapper running on port ' + node.address().port)
  })

  console.log('ready')

  mn.send('listening')
}

main()
