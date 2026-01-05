const split = require('split2')
const proc = require('child_process')
const fs = require('fs')
const path = require('path')
const net = require('net')
const { EventEmitter } = require('events')
const os = require('os')
const { parseExtendedTypes, serializeError } = require('./ext')

class Mininet extends EventEmitter {
  constructor(opts = {}) {
    super()
    if (!(this instanceof Mininet)) return new Mininet(opts)

    this.hosts = []
    this.switches = []
    this.controllers = []
    this.started = false
    this.stopped = false

    this._defer = opts.defer ? [] : null
    this._queue = []
    this._python = null
    this._sock = opts.sock || path.join(os.tmpdir(), 'mn.' + Math.random() + 'sock')
    this._stdio = opts.stdio
    this._prefixStdio = opts.prefixStdio
    this._server = null
    this._args = ['python', '-i']
    this._debug = !!opts.debug
    if (opts.clean) this._args.unshift(path.join(__dirname, 'clean.sh'))
    if (process.getuid() && opts.sudo !== false) {
      this._args.unshift('sudo', '-E')
    }

    this._listen()
  }

  _listen() {
    const self = this

    this._server = net.createServer(onsocket)
    this._server.unref()
    fs.unlink(this._sock, onready)

    function onsocket(socket) {
      socket.unref()
      socket.on('error', function () {
        socket.destroy()
      })
      socket.once('readable', function onreadable() {
        let header = socket.read(32)
        if (!header) return socket.once('readable', onreadable)
        header = header.toString().trim().split(' ')
        const host = self.hosts[Number(header[0])]
        if (!host) return socket.destroy()
        if (header[2] === 'stdio') host._onstdio(Number(header[1]), socket)
        if (header[2] === 'rpc') host._onrpc(Number(header[1]), socket)
      })
    }

    function onready() {
      if (self.stopped) return
      self._server.listen(self._sock)
    }
  }

  _onexit(code) {
    if (code === 10) {
      this.emit('error', new Error('Mininet not installed'))
    }

    if (this.started) this.emit('stop')
    this.emit('close')
  }

  _exec(cmd) {
    if (this._defer) this._defer.push(cmd)
    else this._execNow(cmd)
  }

  _execNow(cmd) {
    if (!this._python) {
      this._python = proc.spawn(this._args[0], this._args.slice(1))
      this._python.on('exit', this._onexit.bind(this))
      this._python.stderr.resume()
      if (this._debug) this._python.stderr.pipe(process.stderr)
      this._python.stdout.pipe(split()).on('data', this._parse.bind(this))
      this._python.stdin.write(
        trim(`
        try:
          import json
          from mininet.topo import Topo
          from mininet.net import Mininet
          from mininet.node import findController
          from mininet.node import OVSBridge
          from mininet.link import Link, TCLink, OVSLink
        except:
          exit(10)

        def print_host(h):
          try:
            print("ack", json.dumps({'name': h.name, 'ip': h.IP(), 'mac': h.MAC()}))
          except:
            print("err", json.dumps("host info failed"))

        def net_start():
          try:
            net.start()
            result = []
            for h in net.hosts:
              result.append({'name': h.name, 'ip': h.IP(), 'mac': h.MAC()})
            print("ack", json.dumps(result))
          except:
            print("err", json.dumps("start failed"))

        net = Mininet(link=TCLink, switch=OVSBridge, controller=findController())
      `)
      )
    }

    this._python.stdin.write(trim(cmd))
  }

  stop(cb) {
    if (!cb) cb = noop

    if (this.stopped || !this.started) {
      process.nextTick(cb)
      return
    }

    this.stopped = true
    this._python.stdin.write('net.stop()')
    this._python.stdin.end(cb)
    fs.unlink(this._sock, noop)
  }

  start(cb) {
    if (!cb) cb = noop

    if (this.stopped) {
      process.nextTick(cb, new Error('Mininet stopped'))
      return
    }

    if (this.started) {
      this._queue.push(cb)
      this._exec(`print("ack")`)
      return
    }

    const self = this

    this.started = true

    if (this._defer) {
      for (let i = 0; i < this._defer.length; i++) this._execNow(this._defer[i])
      this._defer = null
    }

    this._queue.push(onstart)
    this._exec(`
      net_start()
    `)

    function onstart(err, info) {
      if (err) return cb(err)

      for (let i = 0; i < info.length; i++) {
        const inf = info[i]
        const index = Number(inf.name.slice(1)) - 1
        const host = self.hosts[index]
        host.ip = inf.ip
        host.mac = inf.mac
        host.emit('network')
      }

      self.emit('start')
      cb(null)
    }
  }

  createController() {
    const controller = new Controller(this.controllers.length, this)
    this.controllers.push(controller)
    return controller
  }

  createHost() {
    const host = new Host(this.hosts.length, this)
    this.hosts.push(host)
    return host
  }

  createSwitch() {
    const sw = new Switch(this.switches.length, this)
    this.switches.push(sw)
    return sw
  }

  _parse(line) {
    const i = line.indexOf(' ')
    const type = line.slice(0, i)
    const data = line.slice(i + 1)

    switch (type) {
      case 'ack':
        this._queue.shift()(null, JSON.parse(data))
        break

      case 'err':
        this._queue.shift()(new Error(JSON.parse(data)))
        break

      case 'critical':
        this.emit('error', new Error(JSON.parse(data)))
        break
    }
  }
}

class Controller {
  constructor(index, mn) {
    this.index = index
    this.id = 'c' + (index + 1)
    this._mn = mn
    this._mn._exec(`
      ${this.id} = net.addController("${this.id}")
    `)
  }
}

class Switch {
  constructor(index, mn) {
    this.index = index
    this.id = 's' + (index + 1)
    this._mn = mn
    this._mn._exec(`
      try:
        ${this.id} = net.addSwitch("${this.id}")
      except:
        print("critical", json.dumps("add switch failed"))
    `)
  }

  link(to, opts) {
    if (!opts) opts = {}

    let line = ''
    if (opts.bandwidth) opts.bw = opts.bandwidth
    if (opts.bw !== undefined) line += ', bw=' + opts.bw
    if (opts.delay !== undefined) line += ', delay=' + JSON.stringify(opts.delay)
    if (opts.loss !== undefined) line += ', loss=' + opts.loss
    if (opts.htb || opts.useHtb) line += ', use_htb=True'

    this._mn._exec(`
        try:
          net.addLink(${this.id}, ${to.id} ${line})
        except:
          print("critical", json.dumps("add link failed"))
      `)

    return to
  }
}

class Host extends EventEmitter {
  constructor(index, mn) {
    super()

    this.index = index
    this.id = 'h' + (index + 1)
    this.ip = null
    this.mac = null
    this.processes = []
    this._ids = 0
    this._mn = mn
    this._mn._exec(`
      try:
        ${this.id} = net.addHost("${this.id}")
      except:
        print("critical", json.dumps("add host failed"))
    `)
  }

  _process(id) {
    for (let i = 0; i < this.processes.length; i++) {
      const proc = this.processes[i]
      if (proc._id === id) return proc
    }
    return null
  }

  _onrpc(id, socket) {
    const proc = this._process(id)
    if (!proc) return

    proc.rpc = socket
    while (proc.pending.length) {
      const next = proc.pending.shift()
      proc._send(next.name, next.data, next.from)
    }

    socket.pipe(split()).on('data', (data) => {
      try {
        data = JSON.parse(data, parseExtendedTypes)
      } catch (err) {
        socket.destroy()
        return
      }
      if (data.to === '*') return broadcast(data)
      if (data.to) return forward(data, data.to)

      proc.emit('message', data.name, data.data)
      proc.emit('message:' + data.name, data.data)
    })

    proc.emit('rpc')

    function broadcast(data) {
      for (let i = 0; i < this._mn.hosts.length; i++) {
        const h = this._mn.hosts[i]
        for (let j = 0; j < h.processes.length; j++) {
          h.processes[j]._send(data.name, data.data, proc.id)
        }
      }
    }

    function forward(data, to) {
      const parts = to.slice(1).split('.')
      const index = parseInt(parts[0], 10) - 1
      const id = parts.length < 2 ? -1 : parseInt(parts[1], 10)
      const host = this._mn.hosts[index]
      if (!host) return
      for (let i = 0; i < host.processes.length; i++) {
        const p = host.processes[i]
        if (p._id === id || id === -1) p._send(data.name, data.data, proc.id)
      }
    }
  }

  _onstdio(id, socket) {
    const proc = this._process(id)
    if (!proc) return

    proc.stdio = socket

    if (proc.prefixStdio) {
      const p = proc.prefixStdio + ' '
      socket.pipe(split()).on('data', (data) => proc.emit('stdout', Buffer.from(p + data + os.EOL)))
    } else {
      socket.on('data', (data) => proc.emit('stdout', data))
    }

    socket.on('close', () => {
      this._onclose(proc, null)
    })
  }

  update(cb) {
    if (!cb) cb = noop

    const self = this

    this._queue.push(onupdate)
    this._mn._exec(`
      print_host(${this.id})
    `)

    function onupdate(err, info) {
      if (err) return cb(err)

      self.ip = info.ip
      self.mac = info.mac

      cb(null, info)
    }
  }

  link(to, opts) {
    if (!opts) opts = {}

    let line = ''
    if (opts.bandwidth) opts.bw = opts.bandwidth
    if (opts.bw !== undefined) line += ', bw=' + opts.bw
    if (opts.delay !== undefined) line += ', delay=' + JSON.stringify(opts.delay)
    if (opts.loss !== undefined) line += ', loss=' + opts.loss
    if (opts.htb || opts.useHtb) line += ', use_htb=True'

    this._mn._exec(`
      try:
        net.addLink(${this.id}, ${to.id} ${line})
      except:
        print("critical", json.dumps("add link failed"))
    `)

    return to
  }

  spawn(cmd, opts) {
    if (!opts) opts = {}
    if (!Array.isArray(cmd)) cmd = ['/bin/bash', '-c', cmd]
    if (opts.prefixStdio === undefined) opts.prefixStdio = this._mn._prefixStdio
    if (opts.stdio === undefined) opts.stdio = this._mn._stdio

    cmd = cmd.map((c) => JSON.stringify(c)).join(' ')

    const proc = new EventEmitter()
    const self = this

    proc.command = cmd
    proc.stdio = null
    proc.rpc = null
    proc.pending = []
    proc._id = this._ids++
    proc.id = this.id + '.' + proc._id
    proc.pid = 0
    proc.kill = kill
    proc.send = sendFromHost
    proc._send = send
    proc.killed = false
    proc.prefixStdio = opts.prefixStdio || null
    if (proc.prefixStdio === true) proc.prefixStdio = `[${proc.id}]`

    this.processes.push(proc)
    this.exec(fork(this.index, proc._id, cmd, this._mn._sock), onspawn)

    if (opts.stdio === 'inherit') {
      proc.on('stdout', (data) => process.stdout.write(data))
    }

    return proc

    function sendFromHost(name, data) {
      send(name, data, 'host')
    }

    function send(name, data, from) {
      if (!proc.rpc) {
        proc.pending.push({ name: name, data: data, from: from })
        return
      }

      proc.rpc.write(JSON.stringify({ name: name, data: data, from: from }, serializeError) + '\n')
    }

    function kill(sig) {
      if (proc.killed) return
      proc.killed = true
      if (!sig) sig = 'SIGTERM'
      if (proc.pid) pkill()
      else proc.once('spawn', pkill)

      function pkill() {
        const ppid = `$(ps -o ppid,pid | grep '^[ ]*${proc.pid}' | awk '{print $2}' | head -n 1)`
        self.exec(`pkill -P ${ppid} --signal ${sig}`)
      }
    }

    function onspawn(err, data) {
      if (err) return self._onclose(proc, err)
      const pid = Number(data.trim().split('\n').pop())
      proc.pid = pid
      proc.emit('spawn')
    }
  }

  spawnNode(prog, opts) {
    return this.spawn(
      [
        process.execPath,
        '-e',
        'require("vm").runInThisContext(Buffer.from("' +
          Buffer.from(prog).toString('hex') +
          '", "hex").toString(), {filename: "[eval]"})'
      ],
      opts
    )
  }

  _onclose(proc, err) {
    const i = this.processes.indexOf(proc)
    if (i > -1) this.processes.splice(i, 1)
    proc.killed = true
    if (err) proc.emit('error', err)
    proc.emit('close')
    proc.emit('exit')
  }

  exec(cmd, cb) {
    this._mn._queue.push(cb || noop)
    this._mn._exec(`
      res = ${this.id}.cmd(${JSON.stringify(cmd)})
      print("ack", json.dumps(res))
    `)
  }
}

function header(index, id, type) {
  let str = index + ' ' + id + ' ' + type
  while (str.length < 31) str += ' '
  return str
}

function fork(host, id, cmd, sock) {
  const h1 = header(host, id, 'stdio')
  const h2 = header(host, id, 'rpc')
  const env = `export MN_HEADER="${h2}" && export MN_SOCK="${sock}"`
  return `((${env} && echo "${h1}" && (${cmd})) 2>&1 | nc -U "${sock}") & echo $!`
}

function noop() {}

function trim(s) {
  const indent = (s.match(/\n([ ]+)/m) || [])[1] || ''
  s = indent + s.trim()
  return (
    s
      .split('\n')
      .map((l) => l.replace(indent, ''))
      .join('\n') + '\n\n'
  )
}

module.exports = Mininet
