{ pkgs ? import (fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/b51242d7d43689db2f3be91bd05d5b24fbb469c4.tar.gz";
    sha256 = "0ldd02kkfzndk0x98zsg992gqz84ip18hvrq01wws6p96ki176rb";
  }) {},

  # Playwright v1.59.1
  unstablePkgs ? import (fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/b51242d7d43689db2f3be91bd05d5b24fbb469c4.tar.gz";
    sha256 = "0ldd02kkfzndk0x98zsg992gqz84ip18hvrq01wws6p96ki176rb";
  }) {},
}:

let
  nix-ld-libs = pkgs.buildEnv {
    name = "nix-ld-libs";
    paths = with pkgs; [
      stdenv.cc.cc.lib
      zlib
      openssl
    ];
  };

in pkgs.mkShell {
  packages = with pkgs; [
    mise
    lsof
    pkg-config
    openssl.dev
    (writeShellScriptBin "fish" ''
      exec ${pkgs.fish}/bin/fish -C 'mise activate fish | source' "$@"
    '')
  ];

  shellHook = ''
    export NIX_LD="${pkgs.stdenv.cc.libc}/lib/ld-linux-x86-64.so.2"
    export NIX_LD_LIBRARY_PATH="${nix-ld-libs}/lib"

    export MISE_NODE_COMPILE=false
    eval "$(mise activate bash)"

    export PLAYWRIGHT_BROWSERS_PATH=${unstablePkgs.playwright-driver.browsers}
    export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

    playwrightPnpmVersion=($(pnpm list -r @playwright/test | grep playwright))
    playwrightPnpmVersion=''${playwrightPnpmVersion[1]}

    echo "❄️  Playwright nix version: ${unstablePkgs.playwright.version}"
    echo "📦 Playwright npm version: $playwrightPnpmVersion"

    if [ "${unstablePkgs.playwright.version}" != "$playwrightPnpmVersion" ]; then
      echo "❌ Playwright versions in nix and npm are not the same!"
    else
      echo "✅ Playwright versions in nix and npm are the same"
    fi
  '';
}