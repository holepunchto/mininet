# -*- mode: ruby -*-
# vi: set ft=ruby :
VAGRANTFILE_API_VERSION = "2"
Vagrant.require_version ">=1.7.0"

# System-level packages (run as root)
$setup_system = <<SCRIPT
set -e
apt-get -y update
apt-get -y install -y build-essential openvswitch-switch mininet python3-pip

systemctl enable openvswitch-switch
systemctl start openvswitch-switch
systemctl status openvswitch-switch --no-pager

echo "System packages installed!"
ovs-vsctl show
SCRIPT

# User-level tools (run as vagrant user)
$setup_user_tools = <<SCRIPT
set -e

# Install nvm
echo "Installing nvm..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# Load nvm in current shell
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node 24
echo "Installing Node.js 24..."
nvm install 24
nvm use 24
nvm alias default 24

# Verify Node installation
node --version
npm --version

# Install poetry
echo "Installing Poetry..."
curl -sSL https://install.python-poetry.org | python3 -

# Add poetry to PATH for current session
export PATH="$HOME/.local/bin:$PATH"

# Verify Poetry installation
$HOME/.local/bin/poetry --version

echo ""
echo "========================================="
echo "Setup complete!"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Poetry: $($HOME/.local/bin/poetry --version)"
echo "========================================="
echo ""
echo "Note: nvm and poetry are available for the vagrant user"
echo "After 'vagrant ssh', they'll be in your PATH automatically"
SCRIPT

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  config.vm.define "ubuntu-22", primary: true do |ubuntu|
       ubuntu.vm.box = "bento/ubuntu-22.04"
       ubuntu.vm.box_version = "202510.26.0"

       ubuntu.vm.provider "parallels" do |prl|
         prl.name = "openvswitch-ubuntu"
         prl.memory = 2048
         prl.cpus = 2
         prl.update_guest_tools = true
       end

       ubuntu.vm.synced_folder ".", "/vagrant", type: "rsync"

       # System setup (as root)
       ubuntu.vm.provision "setup_system", type: "shell", inline: $setup_system

       # User tools (as vagrant user)
       ubuntu.vm.provision "setup_user_tools", type: "shell", privileged: false, inline: $setup_user_tools
  end
end
