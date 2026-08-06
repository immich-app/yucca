include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# partition/region are injected by the root config (parsed from the path:
# deployment/<partition>/<region>/netbird). State key: yucca/staging/global/netbird/.
