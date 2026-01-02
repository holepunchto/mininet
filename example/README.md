# Usage

1. Get deps
```sh
poetry install
```

2. Activate venv
```sh
eval $(poetry env activate)
```

2. Run example
```sh
node ./example.js
```

### With Vagrant

`Vagrantfile` provides all the deps needed to run this.

1. Setup
```sh
vagrant up
vagrant ssh
```

2. Run example
```sh
git clone https://github.com/mafintosh/mininet.git
cd mininet
npm i
cd example
poetry install
eval $(poetry env activate)
poetry run sudo node example.js # gives clean output
```
