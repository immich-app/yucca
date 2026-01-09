{
  pkgs ? import <nixpkgs> { },
}:

with pkgs;
pkgs.mkShell {
  buildInputs = [
    mise
    (writeShellScriptBin "fish" ''
      exec ${pkgs.fish}/bin/fish -C 'mise activate fish | source' "$@"
    '')
  ];

  shellHook = ''
    eval "$(mise activate bash)"
  '';
}
