const DHT = require('hyperdht')
const process = require('process')

const ip = process.argv[2]

async function main() {
  console.log('connecting to bootstrap at', ip)

  const bootstrap = [{ host: ip, port: 49737 }]

  const node1 = new DHT({ bootstrap })
  const node2 = new DHT({ bootstrap })

  await node1.fullyBootstrapped()
  await node2.fullyBootstrapped()

  const server = node1.createServer(function (socket) {
    console.log('server connection')
    // ...
  })
  await server.listen()

  // const socket = node2.connect(server.publicKey)
  // socket.once('open', function () {
  //   console.log('socket open')
  // })
}

main()
