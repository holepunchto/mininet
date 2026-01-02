const http = require('http')
const mn = require('../host')

const server = http.createServer(function (req, res) {
  console.log('Server responding')
  res.end('Hello from server!\n')
})

server.listen(10000, function () {
  console.log('Server listening on', this.address().port)
  mn.send('listening')
})
