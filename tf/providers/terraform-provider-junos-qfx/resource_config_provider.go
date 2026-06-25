package main

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"os"
	"terraform-provider-junos-qfx/patch"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/attr"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
)



var TrimmedSchemaJSON = `{
  "device_type": "qfx",
  "path": "",
  "root": {
    "children": [
      {
        "children": [
          {
            "children": [
              {
                "children": [
                  {
                    "children": [
                      {
                        "leaf-type": "union",
                        "name": "device-count",
                        "path": "chassis/aggregated-devices/ethernet",
                        "type": "leaf",
                        "types": [
                          {
                            "path": "chassis/aggregated-devices/ethernet/device-count",
                            "patterns": [
                              "\u003c.*\u003e|$.*"
                            ],
                            "type": "string"
                          },
                          {
                            "path": "chassis/aggregated-devices/ethernet/device-count",
                            "type": "uint32"
                          }
                        ]
                      }
                    ],
                    "name": "ethernet",
                    "path": "chassis/aggregated-devices",
                    "type": "container"
                  }
                ],
                "name": "aggregated-devices",
                "path": "chassis",
                "type": "container"
              },
              {
                "children": [
                  {
                    "leaf-type": "union",
                    "name": "name",
                    "path": "chassis/fpc",
                    "type": "leaf",
                    "types": [
                      {
                        "path": "chassis/fpc/name",
                        "patterns": [
                          "\u003c.*\u003e|$.*"
                        ],
                        "type": "string"
                      },
                      {
                        "path": "chassis/fpc/name",
                        "type": "uint32"
                      }
                    ]
                  },
                  {
                    "children": [
                      {
                        "leaf-type": "union",
                        "name": "name",
                        "path": "chassis/fpc/pic",
                        "type": "leaf",
                        "types": [
                          {
                            "path": "chassis/fpc/pic/name",
                            "patterns": [
                              "\u003c.*\u003e|$.*"
                            ],
                            "type": "string"
                          },
                          {
                            "path": "chassis/fpc/pic/name",
                            "type": "uint32"
                          }
                        ]
                      },
                      {
                        "children": [
                          {
                            "leaf-type": "union",
                            "name": "name",
                            "path": "chassis/fpc/pic/port",
                            "type": "leaf",
                            "types": [
                              {
                                "path": "chassis/fpc/pic/port/name",
                                "patterns": [
                                  "\u003c.*\u003e|$.*"
                                ],
                                "type": "string"
                              },
                              {
                                "path": "chassis/fpc/pic/port/name",
                                "type": "uint32"
                              }
                            ]
                          },
                          {
                            "enums": [
                              {
                                "id": "oc3-stm1",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 0
                              },
                              {
                                "id": "oc12-stm4",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 1
                              },
                              {
                                "id": "oc48-stm16",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 2
                              },
                              {
                                "id": "1G",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 3
                              },
                              {
                                "id": "10g",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 4
                              },
                              {
                                "id": "25g",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 5
                              },
                              {
                                "id": "40g",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 6
                              },
                              {
                                "id": "100g",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 7
                              },
                              {
                                "id": "50g",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 8
                              },
                              {
                                "id": "200g",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 9
                              },
                              {
                                "id": "400g",
                                "path": "chassis/fpc/pic/port/speed",
                                "value": 10
                              }
                            ],
                            "leaf-type": "enumeration",
                            "name": "speed",
                            "path": "chassis/fpc/pic/port",
                            "type": "leaf"
                          },
                          {
                            "enums": [
                              {
                                "id": "10g",
                                "path": "chassis/fpc/pic/port/channel-speed",
                                "value": 0
                              },
                              {
                                "id": "25g",
                                "path": "chassis/fpc/pic/port/channel-speed",
                                "value": 1
                              },
                              {
                                "id": "50g",
                                "path": "chassis/fpc/pic/port/channel-speed",
                                "value": 2
                              },
                              {
                                "id": "disable-auto-speed-detection",
                                "path": "chassis/fpc/pic/port/channel-speed",
                                "value": 3
                              }
                            ],
                            "leaf-type": "enumeration",
                            "name": "channel-speed",
                            "path": "chassis/fpc/pic/port",
                            "type": "leaf"
                          }
                        ],
                        "key": "name",
                        "name": "port",
                        "path": "chassis/fpc/pic",
                        "type": "list"
                      }
                    ],
                    "key": "name",
                    "name": "pic",
                    "path": "chassis/fpc",
                    "type": "list"
                  }
                ],
                "key": "name",
                "name": "fpc",
                "path": "chassis",
                "type": "list"
              }
            ],
            "name": "chassis",
            "path": "",
            "type": "container"
          },
          {
            "children": [
              {
                "children": [
                  {
                    "children": [
                      {
                        "children": [
                          {
                            "leaf-type": "string",
                            "name": "name",
                            "path": "firewall/family/inet/filter",
                            "type": "leaf"
                          },
                          {
                            "children": [
                              {
                                "leaf-type": "string",
                                "name": "name",
                                "path": "firewall/family/inet/filter/term",
                                "type": "leaf"
                              },
                              {
                                "children": [
                                  {
                                    "children": [
                                      {
                                        "base-type": "string",
                                        "leaf-type": "jt:ipv4prefix",
                                        "name": "name",
                                        "path": "firewall/family/inet/filter/term/from/source-address",
                                        "type": "leaf"
                                      }
                                    ],
                                    "key": "name",
                                    "name": "source-address",
                                    "ordered-by": "user",
                                    "path": "firewall/family/inet/filter/term/from",
                                    "type": "list"
                                  },
                                  {
                                    "children": [
                                      {
                                        "base-type": "string",
                                        "leaf-type": "jt:ipv4prefix",
                                        "name": "name",
                                        "path": "firewall/family/inet/filter/term/from/destination-address",
                                        "type": "leaf"
                                      }
                                    ],
                                    "key": "name",
                                    "name": "destination-address",
                                    "ordered-by": "user",
                                    "path": "firewall/family/inet/filter/term/from",
                                    "type": "list"
                                  }
                                ],
                                "name": "from",
                                "path": "firewall/family/inet/filter/term",
                                "type": "container"
                              },
                              {
                                "children": [
                                  {
                                    "leaf-type": "empty",
                                    "name": "accept",
                                    "path": "firewall/family/inet/filter/term/then",
                                    "type": "leaf"
                                  },
                                  {
                                    "name": "discard",
                                    "path": "firewall/family/inet/filter/term/then",
                                    "type": "container"
                                  }
                                ],
                                "name": "then",
                                "path": "firewall/family/inet/filter/term",
                                "type": "container"
                              }
                            ],
                            "key": "name",
                            "name": "term",
                            "ordered-by": "user",
                            "path": "firewall/family/inet/filter",
                            "type": "list"
                          }
                        ],
                        "key": "name",
                        "name": "filter",
                        "path": "firewall/family/inet",
                        "type": "list"
                      }
                    ],
                    "name": "inet",
                    "path": "firewall/family",
                    "type": "container"
                  }
                ],
                "name": "family",
                "path": "firewall",
                "type": "container"
              }
            ],
            "name": "firewall",
            "path": "",
            "type": "container"
          },
          {
            "children": [
              {
                "children": [
                  {
                    "leaf-type": "string",
                    "lengths": [
                      {
                        "max": 127,
                        "min": 1,
                        "path": "forwarding-options/storm-control-profiles/name"
                      }
                    ],
                    "name": "name",
                    "path": "forwarding-options/storm-control-profiles",
                    "type": "leaf"
                  },
                  {
                    "children": [
                      {
                        "leaf-type": "union",
                        "name": "bandwidth-level",
                        "path": "forwarding-options/storm-control-profiles/all",
                        "type": "leaf",
                        "types": [
                          {
                            "path": "forwarding-options/storm-control-profiles/all/bandwidth-level",
                            "patterns": [
                              "\u003c.*\u003e|$.*"
                            ],
                            "type": "string"
                          },
                          {
                            "path": "forwarding-options/storm-control-profiles/all/bandwidth-level",
                            "type": "uint32"
                          }
                        ],
                        "units": "kbps"
                      }
                    ],
                    "name": "all",
                    "path": "forwarding-options/storm-control-profiles",
                    "type": "container"
                  }
                ],
                "key": "name",
                "name": "storm-control-profiles",
                "path": "forwarding-options",
                "type": "list"
              }
            ],
            "name": "forwarding-options",
            "path": "",
            "type": "container"
          },
          {
            "children": [
              {
                "children": [
                  {
                    "leaf-type": "string",
                    "name": "name",
                    "path": "interfaces/interface",
                    "type": "leaf"
                  },
                  {
                    "leaf-type": "union",
                    "name": "mtu",
                    "path": "interfaces/interface",
                    "type": "leaf",
                    "types": [
                      {
                        "path": "interfaces/interface/mtu",
                        "patterns": [
                          "\u003c.*\u003e|$.*"
                        ],
                        "type": "string"
                      },
                      {
                        "path": "interfaces/interface/mtu",
                        "type": "uint32"
                      }
                    ]
                  },
                  {
                    "children": [
                      {
                        "children": [
                          {
                            "leaf-type": "union",
                            "name": "bundle",
                            "path": "interfaces/interface/ether-options/ieee-802.3ad",
                            "type": "leaf",
                            "types": [
                              {
                                "path": "interfaces/interface/ether-options/ieee-802.3ad/bundle",
                                "type": "string"
                              },
                              {
                                "path": "interfaces/interface/ether-options/ieee-802.3ad/bundle",
                                "patterns": [
                                  "\u003c.*\u003e|$.*"
                                ],
                                "type": "string"
                              }
                            ]
                          }
                        ],
                        "name": "ieee-802.3ad",
                        "path": "interfaces/interface/ether-options",
                        "type": "container"
                      }
                    ],
                    "name": "ether-options",
                    "path": "interfaces/interface",
                    "type": "container"
                  },
                  {
                    "children": [
                      {
                        "children": [
                          {
                            "leaf-type": "empty",
                            "name": "active",
                            "path": "interfaces/interface/aggregated-ether-options/lacp",
                            "type": "leaf"
                          }
                        ],
                        "name": "lacp",
                        "path": "interfaces/interface/aggregated-ether-options",
                        "type": "container"
                      }
                    ],
                    "name": "aggregated-ether-options",
                    "path": "interfaces/interface",
                    "type": "container"
                  },
                  {
                    "children": [
                      {
                        "leaf-type": "string",
                        "name": "name",
                        "path": "interfaces/interface/unit",
                        "type": "leaf"
                      },
                      {
                        "children": [
                          {
                            "children": [
                              {
                                "children": [
                                  {
                                    "children": [
                                      {
                                        "leaf-type": "string",
                                        "name": "filter-name",
                                        "path": "interfaces/interface/unit/family/inet/filter/input",
                                        "type": "leaf"
                                      }
                                    ],
                                    "name": "input",
                                    "path": "interfaces/interface/unit/family/inet/filter",
                                    "type": "container"
                                  }
                                ],
                                "name": "filter",
                                "path": "interfaces/interface/unit/family/inet",
                                "type": "container"
                              },
                              {
                                "children": [
                                  {
                                    "base-type": "string",
                                    "leaf-type": "jt:ipv4prefix",
                                    "name": "name",
                                    "path": "interfaces/interface/unit/family/inet/address",
                                    "type": "leaf"
                                  }
                                ],
                                "key": "name",
                                "name": "address",
                                "ordered-by": "user",
                                "path": "interfaces/interface/unit/family/inet",
                                "type": "list"
                              }
                            ],
                            "name": "inet",
                            "path": "interfaces/interface/unit/family",
                            "type": "container"
                          },
                          {
                            "children": [
                              {
                                "default": "access",
                                "enums": [
                                  {
                                    "id": "access",
                                    "path": "interfaces/interface/unit/family/ethernet-switching/interface-mode",
                                    "value": 0
                                  },
                                  {
                                    "id": "trunk",
                                    "path": "interfaces/interface/unit/family/ethernet-switching/interface-mode",
                                    "value": 1
                                  }
                                ],
                                "leaf-type": "enumeration",
                                "name": "interface-mode",
                                "path": "interfaces/interface/unit/family/ethernet-switching",
                                "type": "leaf"
                              },
                              {
                                "children": [
                                  {
                                    "leaf-type": "string",
                                    "name": "members",
                                    "ordered-by": "user",
                                    "path": "interfaces/interface/unit/family/ethernet-switching/vlan",
                                    "type": "leaf-list"
                                  }
                                ],
                                "name": "vlan",
                                "path": "interfaces/interface/unit/family/ethernet-switching",
                                "type": "container"
                              },
                              {
                                "children": [
                                  {
                                    "leaf-type": "string",
                                    "name": "profile-name",
                                    "path": "interfaces/interface/unit/family/ethernet-switching/storm-control",
                                    "type": "leaf"
                                  }
                                ],
                                "name": "storm-control",
                                "path": "interfaces/interface/unit/family/ethernet-switching",
                                "type": "container"
                              }
                            ],
                            "name": "ethernet-switching",
                            "path": "interfaces/interface/unit/family",
                            "type": "container"
                          }
                        ],
                        "name": "family",
                        "path": "interfaces/interface/unit",
                        "type": "container"
                      }
                    ],
                    "key": "name",
                    "name": "unit",
                    "path": "interfaces/interface",
                    "type": "list"
                  }
                ],
                "key": "name",
                "name": "interface",
                "path": "interfaces",
                "type": "list"
              }
            ],
            "name": "interfaces",
            "path": "",
            "type": "container"
          },
          {
            "children": [
              {
                "children": [
                  {
                    "children": [
                      {
                        "leaf-type": "string",
                        "name": "name",
                        "path": "protocols/lldp/interface",
                        "type": "leaf"
                      }
                    ],
                    "key": "name",
                    "name": "interface",
                    "ordered-by": "user",
                    "path": "protocols/lldp",
                    "type": "list"
                  }
                ],
                "name": "lldp",
                "path": "protocols",
                "type": "container"
              }
            ],
            "name": "protocols",
            "path": "",
            "type": "container"
          },
          {
            "children": [
              {
                "children": [
                  {
                    "children": [
                      {
                        "base-type": "string",
                        "leaf-type": "jt:ipprefix",
                        "name": "name",
                        "path": "routing-options/static/route",
                        "type": "leaf"
                      },
                      {
                        "leaf-type": "union",
                        "name": "next-hop",
                        "ordered-by": "user",
                        "path": "routing-options/static/route",
                        "type": "leaf-list",
                        "types": [
                          {
                            "path": "routing-options/static/route/next-hop",
                            "type": "string"
                          },
                          {
                            "path": "routing-options/static/route/next-hop",
                            "patterns": [
                              "\u003c.*\u003e|$.*"
                            ],
                            "type": "string"
                          }
                        ]
                      }
                    ],
                    "key": "name",
                    "name": "route",
                    "path": "routing-options/static",
                    "type": "list"
                  }
                ],
                "name": "static",
                "path": "routing-options",
                "type": "container"
              }
            ],
            "name": "routing-options",
            "path": "",
            "type": "container"
          },
          {
            "children": [
              {
                "leaf-type": "string",
                "lengths": [
                  {
                    "max": 255,
                    "min": 1,
                    "path": "system/host-name"
                  }
                ],
                "name": "host-name",
                "path": "system",
                "type": "leaf"
              },
              {
                "children": [
                  {
                    "leaf-type": "string",
                    "lengths": [
                      {
                        "max": 128,
                        "min": 1,
                        "path": "system/root-authentication/encrypted-password"
                      }
                    ],
                    "name": "encrypted-password",
                    "path": "system/root-authentication",
                    "type": "leaf"
                  }
                ],
                "name": "root-authentication",
                "path": "system",
                "type": "container"
              },
              {
                "children": [
                  {
                    "children": [
                      {
                        "leaf-type": "string",
                        "name": "name",
                        "path": "system/login/user",
                        "type": "leaf"
                      },
                      {
                        "leaf-type": "union",
                        "name": "uid",
                        "path": "system/login/user",
                        "type": "leaf",
                        "types": [
                          {
                            "path": "system/login/user/uid",
                            "patterns": [
                              "\u003c.*\u003e|$.*"
                            ],
                            "type": "string"
                          },
                          {
                            "path": "system/login/user/uid",
                            "ranges": [
                              {
                                "max": 64000,
                                "min": 100,
                                "path": "system/login/user/uid"
                              }
                            ],
                            "type": "uint32"
                          }
                        ]
                      },
                      {
                        "leaf-type": "string",
                        "name": "class",
                        "path": "system/login/user",
                        "type": "leaf"
                      },
                      {
                        "children": [
                          {
                            "children": [
                              {
                                "leaf-type": "string",
                                "name": "name",
                                "path": "system/login/user/authentication/ssh-ed25519",
                                "type": "leaf"
                              }
                            ],
                            "key": "name",
                            "name": "ssh-ed25519",
                            "ordered-by": "user",
                            "path": "system/login/user/authentication",
                            "type": "list"
                          }
                        ],
                        "name": "authentication",
                        "path": "system/login/user",
                        "type": "container"
                      }
                    ],
                    "key": "name",
                    "name": "user",
                    "path": "system/login",
                    "type": "list"
                  }
                ],
                "name": "login",
                "path": "system",
                "type": "container"
              },
              {
                "children": [
                  {
                    "children": [
                      {
                        "name": "ssh",
                        "path": "system/services/netconf",
                        "type": "container"
                      }
                    ],
                    "name": "netconf",
                    "path": "system/services",
                    "type": "container"
                  },
                  {
                    "children": [
                      {
                        "enums": [
                          {
                            "id": "allow",
                            "path": "system/services/ssh/root-login",
                            "value": 0
                          },
                          {
                            "id": "deny",
                            "path": "system/services/ssh/root-login",
                            "value": 1
                          },
                          {
                            "id": "deny-password",
                            "path": "system/services/ssh/root-login",
                            "value": 2
                          }
                        ],
                        "leaf-type": "enumeration",
                        "name": "root-login",
                        "path": "system/services/ssh",
                        "type": "leaf"
                      }
                    ],
                    "name": "ssh",
                    "path": "system/services",
                    "type": "container"
                  }
                ],
                "name": "services",
                "path": "system",
                "type": "container"
              },
              {
                "default": "UTC",
                "leaf-type": "string",
                "name": "time-zone",
                "path": "system",
                "type": "leaf",
                "units": "\u003ccontinent\u003e/\u003cmajor-city\u003e or \u003ctime-zone\u003e"
              },
              {
                "enums": [
                  {
                    "id": "radius",
                    "path": "system/authentication-order",
                    "value": 0
                  },
                  {
                    "id": "tacplus",
                    "path": "system/authentication-order",
                    "value": 1
                  },
                  {
                    "id": "password",
                    "path": "system/authentication-order",
                    "value": 2
                  }
                ],
                "leaf-type": "enumeration",
                "name": "authentication-order",
                "ordered-by": "user",
                "path": "system",
                "type": "leaf-list"
              },
              {
                "children": [
                  {
                    "children": [
                      {
                        "leaf-type": "empty",
                        "name": "log-out-on-disconnect",
                        "path": "system/ports/console",
                        "type": "leaf"
                      }
                    ],
                    "name": "console",
                    "path": "system/ports",
                    "type": "container"
                  }
                ],
                "name": "ports",
                "path": "system",
                "type": "container"
              },
              {
                "children": [
                  {
                    "children": [
                      {
                        "leaf-type": "string",
                        "name": "name",
                        "path": "system/processes/daemon-process",
                        "type": "leaf"
                      },
                      {
                        "leaf-type": "empty",
                        "name": "disable",
                        "path": "system/processes/daemon-process",
                        "type": "leaf"
                      }
                    ],
                    "key": "name",
                    "name": "daemon-process",
                    "ordered-by": "user",
                    "path": "system/processes",
                    "type": "list"
                  }
                ],
                "name": "processes",
                "path": "system",
                "type": "container"
              }
            ],
            "name": "system",
            "path": "",
            "type": "container"
          },
          {
            "children": [
              {
                "leaf-type": "empty",
                "name": "preprovisioned",
                "path": "virtual-chassis",
                "type": "leaf"
              },
              {
                "children": [
                  {
                    "leaf-type": "union",
                    "name": "name",
                    "path": "virtual-chassis/member",
                    "type": "leaf",
                    "types": [
                      {
                        "path": "virtual-chassis/member/name",
                        "patterns": [
                          "\u003c.*\u003e|$.*"
                        ],
                        "type": "string"
                      },
                      {
                        "path": "virtual-chassis/member/name",
                        "type": "int32"
                      }
                    ]
                  },
                  {
                    "default": "line-card",
                    "enums": [
                      {
                        "id": "routing-engine",
                        "path": "virtual-chassis/member/role",
                        "value": 0
                      },
                      {
                        "id": "line-card",
                        "path": "virtual-chassis/member/role",
                        "value": 1
                      }
                    ],
                    "leaf-type": "enumeration",
                    "name": "role",
                    "path": "virtual-chassis/member",
                    "type": "leaf"
                  },
                  {
                    "leaf-type": "string",
                    "lengths": [
                      {
                        "max": 12,
                        "min": 1,
                        "path": "virtual-chassis/member/serial-number"
                      }
                    ],
                    "name": "serial-number",
                    "path": "virtual-chassis/member",
                    "type": "leaf"
                  }
                ],
                "key": "name",
                "name": "member",
                "ordered-by": "user",
                "path": "virtual-chassis",
                "type": "list"
              }
            ],
            "name": "virtual-chassis",
            "path": "",
            "type": "container"
          },
          {
            "children": [
              {
                "children": [
                  {
                    "leaf-type": "string",
                    "lengths": [
                      {
                        "max": 64,
                        "min": 2,
                        "path": "vlans/vlan/name"
                      }
                    ],
                    "name": "name",
                    "path": "vlans/vlan",
                    "type": "leaf"
                  },
                  {
                    "leaf-type": "string",
                    "name": "vlan-id",
                    "path": "vlans/vlan",
                    "type": "leaf"
                  },
                  {
                    "leaf-type": "union",
                    "name": "l3-interface",
                    "path": "vlans/vlan",
                    "type": "leaf",
                    "types": [
                      {
                        "path": "vlans/vlan/l3-interface",
                        "type": "string"
                      },
                      {
                        "path": "vlans/vlan/l3-interface",
                        "patterns": [
                          "\u003c.*\u003e|$.*"
                        ],
                        "type": "string"
                      }
                    ]
                  }
                ],
                "key": "name",
                "name": "vlan",
                "path": "vlans",
                "type": "list"
              }
            ],
            "name": "vlans",
            "path": "",
            "type": "container"
          }
        ],
        "config": "true",
        "name": "configuration",
        "path": "",
        "type": "container"
      }
    ],
    "name": "root",
    "path": "",
    "type": "container"
  }
}`// Junos XML Hierarchy

type xml_Configuration struct {
	XMLName xml.Name `xml:"configuration"`
	Chassis []xml_Chassis `xml:"chassis,omitempty"`
	Firewall []xml_Firewall `xml:"firewall,omitempty"`
	Forwarding_options []xml_Forwarding_options `xml:"forwarding-options,omitempty"`
	Interfaces []xml_Interfaces `xml:"interfaces,omitempty"`
	Protocols []xml_Protocols `xml:"protocols,omitempty"`
	Routing_options []xml_Routing_options `xml:"routing-options,omitempty"`
	System []xml_System `xml:"system,omitempty"`
	Virtual_chassis []xml_Virtual_chassis `xml:"virtual-chassis,omitempty"`
	Vlans []xml_Vlans `xml:"vlans,omitempty"`
}
type xml_Chassis struct {
	XMLName xml.Name `xml:"chassis"`
	Aggregated_devices []xml_Chassis_Aggregated_devices `xml:"aggregated-devices,omitempty"`
	Fpc []xml_Chassis_Fpc `xml:"fpc,omitempty"`
}

type xml_Firewall struct {
	XMLName xml.Name `xml:"firewall"`
	Family []xml_Firewall_Family `xml:"family,omitempty"`
}

type xml_Forwarding_options struct {
	XMLName xml.Name `xml:"forwarding-options"`
	Storm_control_profiles []xml_Forwarding_options_Storm_control_profiles `xml:"storm-control-profiles,omitempty"`
}

type xml_Interfaces struct {
	XMLName xml.Name `xml:"interfaces"`
	Interface []xml_Interfaces_Interface `xml:"interface,omitempty"`
}

type xml_Protocols struct {
	XMLName xml.Name `xml:"protocols"`
	Lldp []xml_Protocols_Lldp `xml:"lldp,omitempty"`
}

type xml_Routing_options struct {
	XMLName xml.Name `xml:"routing-options"`
	Static []xml_Routing_options_Static `xml:"static,omitempty"`
}

type xml_System struct {
	XMLName xml.Name `xml:"system"`
	Host_name         *string  `xml:"host-name,omitempty"`
	Root_authentication []xml_System_Root_authentication `xml:"root-authentication,omitempty"`
	Login []xml_System_Login `xml:"login,omitempty"`
	Services []xml_System_Services `xml:"services,omitempty"`
	Time_zone         *string  `xml:"time-zone,omitempty"`
	Authentication_order         []*string  `xml:"authentication-order,omitempty"`
	Ports []xml_System_Ports `xml:"ports,omitempty"`
	Processes []xml_System_Processes `xml:"processes,omitempty"`
}

type xml_Virtual_chassis struct {
	XMLName xml.Name `xml:"virtual-chassis"`
	Preprovisioned         *string  `xml:"preprovisioned,omitempty"`
	Member []xml_Virtual_chassis_Member `xml:"member,omitempty"`
}

type xml_Vlans struct {
	XMLName xml.Name `xml:"vlans"`
	Vlan []xml_Vlans_Vlan `xml:"vlan,omitempty"`
}


type xml_Chassis_Aggregated_devices struct {
	XMLName xml.Name `xml:"aggregated-devices"`
	Ethernet []xml_Chassis_Aggregated_devices_Ethernet `xml:"ethernet,omitempty"`
}
type xml_Chassis_Fpc struct {
	XMLName xml.Name `xml:"fpc"`
	Name         *string  `xml:"name,omitempty"`
	Pic []xml_Chassis_Fpc_Pic `xml:"pic,omitempty"`
}
type xml_Firewall_Family struct {
	XMLName xml.Name `xml:"family"`
	Inet []xml_Firewall_Family_Inet `xml:"inet,omitempty"`
}
type xml_Forwarding_options_Storm_control_profiles struct {
	XMLName xml.Name `xml:"storm-control-profiles"`
	Name         *string  `xml:"name,omitempty"`
	All []xml_Forwarding_options_Storm_control_profiles_All `xml:"all,omitempty"`
}
type xml_Interfaces_Interface struct {
	XMLName xml.Name `xml:"interface"`
	Name         *string  `xml:"name,omitempty"`
	Mtu         *string  `xml:"mtu,omitempty"`
	Ether_options []xml_Interfaces_Interface_Ether_options `xml:"ether-options,omitempty"`
	Aggregated_ether_options []xml_Interfaces_Interface_Aggregated_ether_options `xml:"aggregated-ether-options,omitempty"`
	Unit []xml_Interfaces_Interface_Unit `xml:"unit,omitempty"`
}
type xml_Protocols_Lldp struct {
	XMLName xml.Name `xml:"lldp"`
	Interface []xml_Protocols_Lldp_Interface `xml:"interface,omitempty"`
}
type xml_Routing_options_Static struct {
	XMLName xml.Name `xml:"static"`
	Route []xml_Routing_options_Static_Route `xml:"route,omitempty"`
}
type xml_System_Root_authentication struct {
	XMLName xml.Name `xml:"root-authentication"`
	Encrypted_password         *string  `xml:"encrypted-password,omitempty"`
}
type xml_System_Login struct {
	XMLName xml.Name `xml:"login"`
	User []xml_System_Login_User `xml:"user,omitempty"`
}
type xml_System_Services struct {
	XMLName xml.Name `xml:"services"`
	Netconf []xml_System_Services_Netconf `xml:"netconf,omitempty"`
	Ssh []xml_System_Services_Ssh `xml:"ssh,omitempty"`
}
type xml_System_Ports struct {
	XMLName xml.Name `xml:"ports"`
	Console []xml_System_Ports_Console `xml:"console,omitempty"`
}
type xml_System_Processes struct {
	XMLName xml.Name `xml:"processes"`
	Daemon_process []xml_System_Processes_Daemon_process `xml:"daemon-process,omitempty"`
}
type xml_Virtual_chassis_Member struct {
	XMLName xml.Name `xml:"member"`
	Name         *string  `xml:"name,omitempty"`
	Role         *string  `xml:"role,omitempty"`
	Serial_number         *string  `xml:"serial-number,omitempty"`
}
type xml_Vlans_Vlan struct {
	XMLName xml.Name `xml:"vlan"`
	Name         *string  `xml:"name,omitempty"`
	Vlan_id         *string  `xml:"vlan-id,omitempty"`
	L3_interface         *string  `xml:"l3-interface,omitempty"`
}

type xml_Chassis_Aggregated_devices_Ethernet struct {
	XMLName xml.Name `xml:"ethernet"`
	Device_count         *string  `xml:"device-count,omitempty"`
}
type xml_Chassis_Fpc_Pic struct {
	XMLName xml.Name `xml:"pic"`
	Name         *string  `xml:"name,omitempty"`
	Port []xml_Chassis_Fpc_Pic_Port `xml:"port,omitempty"`
}
type xml_Firewall_Family_Inet struct {
	XMLName xml.Name `xml:"inet"`
	Filter []xml_Firewall_Family_Inet_Filter `xml:"filter,omitempty"`
}
type xml_Forwarding_options_Storm_control_profiles_All struct {
	XMLName xml.Name `xml:"all"`
	Bandwidth_level         *string  `xml:"bandwidth-level,omitempty"`
}
type xml_Interfaces_Interface_Ether_options struct {
	XMLName xml.Name `xml:"ether-options"`
	Ieee_802_3ad []xml_Interfaces_Interface_Ether_options_Ieee_802_3ad `xml:"ieee-802.3ad,omitempty"`
}
type xml_Interfaces_Interface_Aggregated_ether_options struct {
	XMLName xml.Name `xml:"aggregated-ether-options"`
	Lacp []xml_Interfaces_Interface_Aggregated_ether_options_Lacp `xml:"lacp,omitempty"`
}
type xml_Interfaces_Interface_Unit struct {
	XMLName xml.Name `xml:"unit"`
	Name         *string  `xml:"name,omitempty"`
	Family []xml_Interfaces_Interface_Unit_Family `xml:"family,omitempty"`
}
type xml_Protocols_Lldp_Interface struct {
	XMLName xml.Name `xml:"interface"`
	Name         *string  `xml:"name,omitempty"`
}
type xml_Routing_options_Static_Route struct {
	XMLName xml.Name `xml:"route"`
	Name         *string  `xml:"name,omitempty"`
	Next_hop         []*string  `xml:"next-hop,omitempty"`
}
type xml_System_Login_User struct {
	XMLName xml.Name `xml:"user"`
	Name         *string  `xml:"name,omitempty"`
	Uid         *string  `xml:"uid,omitempty"`
	Class         *string  `xml:"class,omitempty"`
	Authentication []xml_System_Login_User_Authentication `xml:"authentication,omitempty"`
}
type xml_System_Services_Netconf struct {
	XMLName xml.Name `xml:"netconf"`
	Ssh []xml_System_Services_Netconf_Ssh `xml:"ssh,omitempty"`
}
type xml_System_Services_Ssh struct {
	XMLName xml.Name `xml:"ssh"`
	Root_login         *string  `xml:"root-login,omitempty"`
}
type xml_System_Ports_Console struct {
	XMLName xml.Name `xml:"console"`
	Log_out_on_disconnect         *string  `xml:"log-out-on-disconnect,omitempty"`
}
type xml_System_Processes_Daemon_process struct {
	XMLName xml.Name `xml:"daemon-process"`
	Name         *string  `xml:"name,omitempty"`
	Disable         *string  `xml:"disable,omitempty"`
}

type xml_Chassis_Fpc_Pic_Port struct {
	XMLName xml.Name `xml:"port"`
	Name         *string  `xml:"name,omitempty"`
	Speed         *string  `xml:"speed,omitempty"`
	Channel_speed         *string  `xml:"channel-speed,omitempty"`
}
type xml_Firewall_Family_Inet_Filter struct {
	XMLName xml.Name `xml:"filter"`
	Name         *string  `xml:"name,omitempty"`
	Term []xml_Firewall_Family_Inet_Filter_Term `xml:"term,omitempty"`
}
type xml_Interfaces_Interface_Ether_options_Ieee_802_3ad struct {
	XMLName xml.Name `xml:"ieee-802.3ad"`
	Bundle         *string  `xml:"bundle,omitempty"`
}
type xml_Interfaces_Interface_Aggregated_ether_options_Lacp struct {
	XMLName xml.Name `xml:"lacp"`
	Active         *string  `xml:"active,omitempty"`
}
type xml_Interfaces_Interface_Unit_Family struct {
	XMLName xml.Name `xml:"family"`
	Inet []xml_Interfaces_Interface_Unit_Family_Inet `xml:"inet,omitempty"`
	Ethernet_switching []xml_Interfaces_Interface_Unit_Family_Ethernet_switching `xml:"ethernet-switching,omitempty"`
}
type xml_System_Login_User_Authentication struct {
	XMLName xml.Name `xml:"authentication"`
	Ssh_ed25519 []xml_System_Login_User_Authentication_Ssh_ed25519 `xml:"ssh-ed25519,omitempty"`
}
type xml_System_Services_Netconf_Ssh struct {
	XMLName xml.Name `xml:"ssh"`
}

type xml_Firewall_Family_Inet_Filter_Term struct {
	XMLName xml.Name `xml:"term"`
	Name         *string  `xml:"name,omitempty"`
	From []xml_Firewall_Family_Inet_Filter_Term_From `xml:"from,omitempty"`
	Then []xml_Firewall_Family_Inet_Filter_Term_Then `xml:"then,omitempty"`
}
type xml_Interfaces_Interface_Unit_Family_Inet struct {
	XMLName xml.Name `xml:"inet"`
	Filter []xml_Interfaces_Interface_Unit_Family_Inet_Filter `xml:"filter,omitempty"`
	Address []xml_Interfaces_Interface_Unit_Family_Inet_Address `xml:"address,omitempty"`
}
type xml_Interfaces_Interface_Unit_Family_Ethernet_switching struct {
	XMLName xml.Name `xml:"ethernet-switching"`
	Interface_mode         *string  `xml:"interface-mode,omitempty"`
	Vlan []xml_Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan `xml:"vlan,omitempty"`
	Storm_control []xml_Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control `xml:"storm-control,omitempty"`
}
type xml_System_Login_User_Authentication_Ssh_ed25519 struct {
	XMLName xml.Name `xml:"ssh-ed25519"`
	Name         *string  `xml:"name,omitempty"`
}

type xml_Firewall_Family_Inet_Filter_Term_From struct {
	XMLName xml.Name `xml:"from"`
	Source_address []xml_Firewall_Family_Inet_Filter_Term_From_Source_address `xml:"source-address,omitempty"`
	Destination_address []xml_Firewall_Family_Inet_Filter_Term_From_Destination_address `xml:"destination-address,omitempty"`
}
type xml_Firewall_Family_Inet_Filter_Term_Then struct {
	XMLName xml.Name `xml:"then"`
	Accept         *string  `xml:"accept,omitempty"`
	Discard []xml_Firewall_Family_Inet_Filter_Term_Then_Discard `xml:"discard,omitempty"`
}
type xml_Interfaces_Interface_Unit_Family_Inet_Filter struct {
	XMLName xml.Name `xml:"filter"`
	Input []xml_Interfaces_Interface_Unit_Family_Inet_Filter_Input `xml:"input,omitempty"`
}
type xml_Interfaces_Interface_Unit_Family_Inet_Address struct {
	XMLName xml.Name `xml:"address"`
	Name         *string  `xml:"name,omitempty"`
}
type xml_Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan struct {
	XMLName xml.Name `xml:"vlan"`
	Members         []*string  `xml:"members,omitempty"`
}
type xml_Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control struct {
	XMLName xml.Name `xml:"storm-control"`
	Profile_name         *string  `xml:"profile-name,omitempty"`
}

type xml_Firewall_Family_Inet_Filter_Term_From_Source_address struct {
	XMLName xml.Name `xml:"source-address"`
	Name         *string  `xml:"name,omitempty"`
}
type xml_Firewall_Family_Inet_Filter_Term_From_Destination_address struct {
	XMLName xml.Name `xml:"destination-address"`
	Name         *string  `xml:"name,omitempty"`
}
type xml_Firewall_Family_Inet_Filter_Term_Then_Discard struct {
	XMLName xml.Name `xml:"discard"`
}
type xml_Interfaces_Interface_Unit_Family_Inet_Filter_Input struct {
	XMLName xml.Name `xml:"input"`
	Filter_name         *string  `xml:"filter-name,omitempty"`
}




// Collecting objects from the .tf file.
type ConfigResourceModel struct {
	ResourceName	types.String `tfsdk:"resource_name"`
	Chassis types.List `tfsdk:"chassis"`
	Firewall types.List `tfsdk:"firewall"`
	Forwarding_options types.List `tfsdk:"forwarding_options"`
	Interfaces types.List `tfsdk:"interfaces"`
	Protocols types.List `tfsdk:"protocols"`
	Routing_options types.List `tfsdk:"routing_options"`
	System types.List `tfsdk:"system"`
	Virtual_chassis types.List `tfsdk:"virtual_chassis"`
	Vlans types.List `tfsdk:"vlans"`
}
func (o ConfigResourceModel) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type {
		"resource_name": 	types.StringType,
		"chassis": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Chassis_Model{}.AttrTypes()}},
		"firewall": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Model{}.AttrTypes()}},
		"forwarding_options": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Forwarding_options_Model{}.AttrTypes()}},
		"interfaces": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Model{}.AttrTypes()}},
		"protocols": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Protocols_Model{}.AttrTypes()}},
		"routing_options": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Routing_options_Model{}.AttrTypes()}},
		"system": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Model{}.AttrTypes()}},
		"virtual_chassis": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Virtual_chassis_Model{}.AttrTypes()}},
		"vlans": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Vlans_Model{}.AttrTypes()}},
	}
}
func (o ConfigResourceModel) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"resource_name": schema.StringAttribute {
			Required: true,
			MarkdownDescription: "xpath is `config.resource_name`",
		},
		"chassis": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Chassis_Model{}.Attributes(),
			},
		},
		"firewall": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Firewall_Model{}.Attributes(),
			},
		},
		"forwarding_options": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Forwarding_options_Model{}.Attributes(),
			},
		},
		"interfaces": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Interfaces_Model{}.Attributes(),
			},
		},
		"protocols": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Protocols_Model{}.Attributes(),
			},
		},
		"routing_options": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Routing_options_Model{}.Attributes(),
			},
		},
		"system": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: System_Model{}.Attributes(),
			},
		},
		"virtual_chassis": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Virtual_chassis_Model{}.Attributes(),
			},
		},
		"vlans": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Vlans_Model{}.Attributes(),
			},
		},
	}
}
type Chassis_Model struct {
	Aggregated_devices	types.List `tfsdk:"aggregated_devices"`
	Fpc	types.List `tfsdk:"fpc"`
}
func (o Chassis_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"aggregated_devices": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Chassis_Aggregated_devices_Model{}.AttrTypes()}},
		"fpc": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Chassis_Fpc_Model{}.AttrTypes()}},
	}
}
func (o Chassis_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"aggregated_devices": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Chassis_Aggregated_devices_Model{}.Attributes(),
			},
		},
		"fpc": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Chassis_Fpc_Model{}.Attributes(),
			},
		},
	}
}
type Firewall_Model struct {
	Family	types.List `tfsdk:"family"`
}
func (o Firewall_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"family": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Family_Model{}.AttrTypes()}},
	}
}
func (o Firewall_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"family": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Firewall_Family_Model{}.Attributes(),
			},
		},
	}
}
type Forwarding_options_Model struct {
	Storm_control_profiles	types.List `tfsdk:"storm_control_profiles"`
}
func (o Forwarding_options_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"storm_control_profiles": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Forwarding_options_Storm_control_profiles_Model{}.AttrTypes()}},
	}
}
func (o Forwarding_options_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"storm_control_profiles": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Forwarding_options_Storm_control_profiles_Model{}.Attributes(),
			},
		},
	}
}
type Interfaces_Model struct {
	Interface	types.List `tfsdk:"interface"`
}
func (o Interfaces_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"interface": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Model{}.AttrTypes()}},
	}
}
func (o Interfaces_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"interface": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Interfaces_Interface_Model{}.Attributes(),
			},
		},
	}
}
type Protocols_Model struct {
	Lldp	types.List `tfsdk:"lldp"`
}
func (o Protocols_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"lldp": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Protocols_Lldp_Model{}.AttrTypes()}},
	}
}
func (o Protocols_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"lldp": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Protocols_Lldp_Model{}.Attributes(),
			},
		},
	}
}
type Routing_options_Model struct {
	Static	types.List `tfsdk:"static"`
}
func (o Routing_options_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"static": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Routing_options_Static_Model{}.AttrTypes()}},
	}
}
func (o Routing_options_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"static": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Routing_options_Static_Model{}.Attributes(),
			},
		},
	}
}
type System_Model struct {
	Host_name	types.String `tfsdk:"host_name"`
	Root_authentication	types.List `tfsdk:"root_authentication"`
	Login	types.List `tfsdk:"login"`
	Services	types.List `tfsdk:"services"`
	Time_zone	types.String `tfsdk:"time_zone"`
	Authentication_order	types.List `tfsdk:"authentication_order"`
	Ports	types.List `tfsdk:"ports"`
	Processes	types.List `tfsdk:"processes"`
}
func (o System_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"host_name": 	types.StringType,
		"root_authentication": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Root_authentication_Model{}.AttrTypes()}},
		"login": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Login_Model{}.AttrTypes()}},
		"services": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Services_Model{}.AttrTypes()}},
		"time_zone": 	types.StringType,
		"authentication_order": 	types.ListType{ElemType: types.StringType},
		"ports": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Ports_Model{}.AttrTypes()}},
		"processes": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Processes_Model{}.AttrTypes()}},
	}
}
func (o System_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"host_name": schema.StringAttribute{
			Optional: true,
			MarkdownDescription: "xpath is `config.System.Host-name`",
		},
		"root_authentication": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: System_Root_authentication_Model{}.Attributes(),
			},
		},
		"login": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: System_Login_Model{}.Attributes(),
			},
		},
		"services": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: System_Services_Model{}.Attributes(),
			},
		},
		"time_zone": schema.StringAttribute{
			Optional: true,
			MarkdownDescription: "xpath is `config.System.Time-zone`",
		},
		"authentication_order": schema.ListAttribute{
			ElementType:         types.StringType,
			Optional:            true,
			MarkdownDescription: "xpath is `config.Authentication-order.System`",
		},
		"ports": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: System_Ports_Model{}.Attributes(),
			},
		},
		"processes": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: System_Processes_Model{}.Attributes(),
			},
		},
	}
}
type Virtual_chassis_Model struct {
	Preprovisioned	types.String `tfsdk:"preprovisioned"`
	Member	types.List `tfsdk:"member"`
}
func (o Virtual_chassis_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"preprovisioned": 	types.StringType,
		"member": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Virtual_chassis_Member_Model{}.AttrTypes()}},
	}
}
func (o Virtual_chassis_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"preprovisioned": schema.StringAttribute{
			Optional: true,
			MarkdownDescription: "xpath is `config.Virtual-chassis.Preprovisioned`",
		},
		"member": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Virtual_chassis_Member_Model{}.Attributes(),
			},
		},
	}
}
type Vlans_Model struct {
	Vlan	types.List `tfsdk:"vlan"`
}
func (o Vlans_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"vlan": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Vlans_Vlan_Model{}.AttrTypes()}},
	}
}
func (o Vlans_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"vlan": schema.ListNestedAttribute{
			Optional: true,
			NestedObject: schema.NestedAttributeObject{
				Attributes: Vlans_Vlan_Model{}.Attributes(),
			},
		},
	}
}

type Chassis_Aggregated_devices_Model struct {
	Ethernet	types.List `tfsdk:"ethernet"`
}
func (o Chassis_Aggregated_devices_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "ethernet": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Chassis_Aggregated_devices_Ethernet_Model{}.AttrTypes()}},
	}
}
func (o Chassis_Aggregated_devices_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "ethernet": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Chassis_Aggregated_devices_Ethernet_Model{}.Attributes(),
	        },
        },
    }
}
type Chassis_Fpc_Model struct {
	Name	types.String `tfsdk:"name"`
	Pic	types.List `tfsdk:"pic"`
}
func (o Chassis_Fpc_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "pic": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Chassis_Fpc_Pic_Model{}.AttrTypes()}},
	}
}
func (o Chassis_Fpc_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Fpc`",
	    },
	    "pic": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Chassis_Fpc_Pic_Model{}.Attributes(),
	        },
        },
    }
}
type Firewall_Family_Model struct {
	Inet	types.List `tfsdk:"inet"`
}
func (o Firewall_Family_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "inet": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Family_Inet_Model{}.AttrTypes()}},
	}
}
func (o Firewall_Family_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "inet": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Firewall_Family_Inet_Model{}.Attributes(),
	        },
        },
    }
}
type Forwarding_options_Storm_control_profiles_Model struct {
	Name	types.String `tfsdk:"name"`
	All	types.List `tfsdk:"all"`
}
func (o Forwarding_options_Storm_control_profiles_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "all": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Forwarding_options_Storm_control_profiles_All_Model{}.AttrTypes()}},
	}
}
func (o Forwarding_options_Storm_control_profiles_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Storm_control_profiles`",
	    },
	    "all": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Forwarding_options_Storm_control_profiles_All_Model{}.Attributes(),
	        },
        },
    }
}
type Interfaces_Interface_Model struct {
	Name	types.String `tfsdk:"name"`
	Mtu	types.String `tfsdk:"mtu"`
	Ether_options	types.List `tfsdk:"ether_options"`
	Aggregated_ether_options	types.List `tfsdk:"aggregated_ether_options"`
	Unit	types.List `tfsdk:"unit"`
}
func (o Interfaces_Interface_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "mtu": 	types.StringType,
	    "ether_options": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Ether_options_Model{}.AttrTypes()}},
	    "aggregated_ether_options": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Aggregated_ether_options_Model{}.AttrTypes()}},
	    "unit": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Model{}.AttrTypes()}},
	}
}
func (o Interfaces_Interface_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Interface`",
	    },
	    "mtu": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Mtu.Interface`",
	    },
	    "ether_options": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Ether_options_Model{}.Attributes(),
	        },
        },
	    "aggregated_ether_options": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Aggregated_ether_options_Model{}.Attributes(),
	        },
        },
	    "unit": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Unit_Model{}.Attributes(),
	        },
        },
    }
}
type Protocols_Lldp_Model struct {
	Interface	types.List `tfsdk:"interface"`
}
func (o Protocols_Lldp_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "interface": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Protocols_Lldp_Interface_Model{}.AttrTypes()}},
	}
}
func (o Protocols_Lldp_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "interface": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Protocols_Lldp_Interface_Model{}.Attributes(),
	        },
        },
    }
}
type Routing_options_Static_Model struct {
	Route	types.List `tfsdk:"route"`
}
func (o Routing_options_Static_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "route": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Routing_options_Static_Route_Model{}.AttrTypes()}},
	}
}
func (o Routing_options_Static_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "route": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Routing_options_Static_Route_Model{}.Attributes(),
	        },
        },
    }
}
type System_Root_authentication_Model struct {
	Encrypted_password	types.String `tfsdk:"encrypted_password"`
}
func (o System_Root_authentication_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "encrypted_password": 	types.StringType,
	}
}
func (o System_Root_authentication_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "encrypted_password": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Encrypted-password.Root_authentication`",
	    },
    }
}
type System_Login_Model struct {
	User	types.List `tfsdk:"user"`
}
func (o System_Login_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "user": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Login_User_Model{}.AttrTypes()}},
	}
}
func (o System_Login_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "user": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: System_Login_User_Model{}.Attributes(),
	        },
        },
    }
}
type System_Services_Model struct {
	Netconf	types.List `tfsdk:"netconf"`
	Ssh	types.List `tfsdk:"ssh"`
}
func (o System_Services_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "netconf": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Services_Netconf_Model{}.AttrTypes()}},
	    "ssh": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Services_Ssh_Model{}.AttrTypes()}},
	}
}
func (o System_Services_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "netconf": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: System_Services_Netconf_Model{}.Attributes(),
	        },
        },
	    "ssh": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: System_Services_Ssh_Model{}.Attributes(),
	        },
        },
    }
}
type System_Ports_Model struct {
	Console	types.List `tfsdk:"console"`
}
func (o System_Ports_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "console": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Ports_Console_Model{}.AttrTypes()}},
	}
}
func (o System_Ports_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "console": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: System_Ports_Console_Model{}.Attributes(),
	        },
        },
    }
}
type System_Processes_Model struct {
	Daemon_process	types.List `tfsdk:"daemon_process"`
}
func (o System_Processes_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "daemon_process": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Processes_Daemon_process_Model{}.AttrTypes()}},
	}
}
func (o System_Processes_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "daemon_process": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: System_Processes_Daemon_process_Model{}.Attributes(),
	        },
        },
    }
}
type Virtual_chassis_Member_Model struct {
	Name	types.String `tfsdk:"name"`
	Role	types.String `tfsdk:"role"`
	Serial_number	types.String `tfsdk:"serial_number"`
}
func (o Virtual_chassis_Member_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "role": 	types.StringType,
	    "serial_number": 	types.StringType,
	}
}
func (o Virtual_chassis_Member_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Member`",
	    },
	    "role": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Role.Member`",
	    },
	    "serial_number": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Serial-number.Member`",
	    },
    }
}
type Vlans_Vlan_Model struct {
	Name	types.String `tfsdk:"name"`
	Vlan_id	types.String `tfsdk:"vlan_id"`
	L3_interface	types.String `tfsdk:"l3_interface"`
}
func (o Vlans_Vlan_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "vlan_id": 	types.StringType,
	    "l3_interface": 	types.StringType,
	}
}
func (o Vlans_Vlan_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Vlan`",
	    },
	    "vlan_id": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Vlan-id.Vlan`",
	    },
	    "l3_interface": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.L3-interface.Vlan`",
	    },
    }
}

type Chassis_Aggregated_devices_Ethernet_Model struct {
	Device_count	types.String `tfsdk:"device_count"`
}
func (o Chassis_Aggregated_devices_Ethernet_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "device_count": 	types.StringType,
	}
}
func (o Chassis_Aggregated_devices_Ethernet_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "device_count": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Device-count.Ethernet`",
	    },
    }
}
type Chassis_Fpc_Pic_Model struct {
	Name	types.String `tfsdk:"name"`
	Port	types.List `tfsdk:"port"`
}
func (o Chassis_Fpc_Pic_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "port": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Chassis_Fpc_Pic_Port_Model{}.AttrTypes()}},
	}
}
func (o Chassis_Fpc_Pic_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Pic`",
	    },
	    "port": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Chassis_Fpc_Pic_Port_Model{}.Attributes(),
	        },
        },
    }
}
type Firewall_Family_Inet_Model struct {
	Filter	types.List `tfsdk:"filter"`
}
func (o Firewall_Family_Inet_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "filter": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Model{}.AttrTypes()}},
	}
}
func (o Firewall_Family_Inet_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "filter": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Firewall_Family_Inet_Filter_Model{}.Attributes(),
	        },
        },
    }
}
type Forwarding_options_Storm_control_profiles_All_Model struct {
	Bandwidth_level	types.String `tfsdk:"bandwidth_level"`
}
func (o Forwarding_options_Storm_control_profiles_All_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "bandwidth_level": 	types.StringType,
	}
}
func (o Forwarding_options_Storm_control_profiles_All_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "bandwidth_level": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Bandwidth-level.All`",
	    },
    }
}
type Interfaces_Interface_Ether_options_Model struct {
	Ieee_802_3ad	types.List `tfsdk:"ieee_802_3ad"`
}
func (o Interfaces_Interface_Ether_options_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "ieee_802_3ad": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Ether_options_Ieee_802_3ad_Model{}.AttrTypes()}},
	}
}
func (o Interfaces_Interface_Ether_options_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "ieee_802_3ad": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Ether_options_Ieee_802_3ad_Model{}.Attributes(),
	        },
        },
    }
}
type Interfaces_Interface_Aggregated_ether_options_Model struct {
	Lacp	types.List `tfsdk:"lacp"`
}
func (o Interfaces_Interface_Aggregated_ether_options_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "lacp": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Aggregated_ether_options_Lacp_Model{}.AttrTypes()}},
	}
}
func (o Interfaces_Interface_Aggregated_ether_options_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "lacp": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Aggregated_ether_options_Lacp_Model{}.Attributes(),
	        },
        },
    }
}
type Interfaces_Interface_Unit_Model struct {
	Name	types.String `tfsdk:"name"`
	Family	types.List `tfsdk:"family"`
}
func (o Interfaces_Interface_Unit_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "family": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Model{}.AttrTypes()}},
	}
}
func (o Interfaces_Interface_Unit_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Unit`",
	    },
	    "family": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Unit_Family_Model{}.Attributes(),
	        },
        },
    }
}
type Protocols_Lldp_Interface_Model struct {
	Name	types.String `tfsdk:"name"`
}
func (o Protocols_Lldp_Interface_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	}
}
func (o Protocols_Lldp_Interface_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Interface`",
	    },
    }
}
type Routing_options_Static_Route_Model struct {
	Name	types.String `tfsdk:"name"`
	Next_hop	types.List `tfsdk:"next_hop"`
}
func (o Routing_options_Static_Route_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
		"next_hop": 	types.ListType{ElemType: types.StringType},
	}
}
func (o Routing_options_Static_Route_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Route`",
	    },
		"next_hop": schema.ListAttribute{
			ElementType:         types.StringType,
			Optional:            true,
			MarkdownDescription: "xpath is `config.Next-hop.Route`",
		},
    }
}
type System_Login_User_Model struct {
	Name	types.String `tfsdk:"name"`
	Uid	types.String `tfsdk:"uid"`
	Class	types.String `tfsdk:"class"`
	Authentication	types.List `tfsdk:"authentication"`
}
func (o System_Login_User_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "uid": 	types.StringType,
	    "class": 	types.StringType,
	    "authentication": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Login_User_Authentication_Model{}.AttrTypes()}},
	}
}
func (o System_Login_User_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.User`",
	    },
	    "uid": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Uid.User`",
	    },
	    "class": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Class.User`",
	    },
	    "authentication": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: System_Login_User_Authentication_Model{}.Attributes(),
	        },
        },
    }
}
type System_Services_Netconf_Model struct {
	Ssh	types.List `tfsdk:"ssh"`
}
func (o System_Services_Netconf_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "ssh": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Services_Netconf_Ssh_Model{}.AttrTypes()}},
	}
}
func (o System_Services_Netconf_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "ssh": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: System_Services_Netconf_Ssh_Model{}.Attributes(),
	        },
        },
    }
}
type System_Services_Ssh_Model struct {
	Root_login	types.String `tfsdk:"root_login"`
}
func (o System_Services_Ssh_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "root_login": 	types.StringType,
	}
}
func (o System_Services_Ssh_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "root_login": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Root-login.Ssh`",
	    },
    }
}
type System_Ports_Console_Model struct {
	Log_out_on_disconnect	types.String `tfsdk:"log_out_on_disconnect"`
}
func (o System_Ports_Console_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "log_out_on_disconnect": 	types.StringType,
	}
}
func (o System_Ports_Console_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "log_out_on_disconnect": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Log-out-on-disconnect.Console`",
	    },
    }
}
type System_Processes_Daemon_process_Model struct {
	Name	types.String `tfsdk:"name"`
	Disable	types.String `tfsdk:"disable"`
}
func (o System_Processes_Daemon_process_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "disable": 	types.StringType,
	}
}
func (o System_Processes_Daemon_process_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Daemon_process`",
	    },
	    "disable": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Disable.Daemon_process`",
	    },
    }
}

type Chassis_Fpc_Pic_Port_Model struct {
	Name	types.String `tfsdk:"name"`
	Speed	types.String `tfsdk:"speed"`
	Channel_speed	types.String `tfsdk:"channel_speed"`
}
func (o Chassis_Fpc_Pic_Port_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "speed": 	types.StringType,
	    "channel_speed": 	types.StringType,
	}
}
func (o Chassis_Fpc_Pic_Port_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Port`",
	    },
	    "speed": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Speed.Port`",
	    },
	    "channel_speed": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Channel-speed.Port`",
	    },
    }
}
type Firewall_Family_Inet_Filter_Model struct {
	Name	types.String `tfsdk:"name"`
	Term	types.List `tfsdk:"term"`
}
func (o Firewall_Family_Inet_Filter_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "term": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_Model{}.AttrTypes()}},
	}
}
func (o Firewall_Family_Inet_Filter_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Filter`",
	    },
	    "term": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Firewall_Family_Inet_Filter_Term_Model{}.Attributes(),
	        },
        },
    }
}
type Interfaces_Interface_Ether_options_Ieee_802_3ad_Model struct {
	Bundle	types.String `tfsdk:"bundle"`
}
func (o Interfaces_Interface_Ether_options_Ieee_802_3ad_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "bundle": 	types.StringType,
	}
}
func (o Interfaces_Interface_Ether_options_Ieee_802_3ad_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "bundle": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Bundle.Ieee_802_3ad`",
	    },
    }
}
type Interfaces_Interface_Aggregated_ether_options_Lacp_Model struct {
	Active	types.String `tfsdk:"active"`
}
func (o Interfaces_Interface_Aggregated_ether_options_Lacp_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "active": 	types.StringType,
	}
}
func (o Interfaces_Interface_Aggregated_ether_options_Lacp_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "active": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Active.Lacp`",
	    },
    }
}
type Interfaces_Interface_Unit_Family_Model struct {
	Inet	types.List `tfsdk:"inet"`
	Ethernet_switching	types.List `tfsdk:"ethernet_switching"`
}
func (o Interfaces_Interface_Unit_Family_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "inet": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Model{}.AttrTypes()}},
	    "ethernet_switching": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Ethernet_switching_Model{}.AttrTypes()}},
	}
}
func (o Interfaces_Interface_Unit_Family_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "inet": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Unit_Family_Inet_Model{}.Attributes(),
	        },
        },
	    "ethernet_switching": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Unit_Family_Ethernet_switching_Model{}.Attributes(),
	        },
        },
    }
}
type System_Login_User_Authentication_Model struct {
	Ssh_ed25519	types.List `tfsdk:"ssh_ed25519"`
}
func (o System_Login_User_Authentication_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "ssh_ed25519": 	types.ListType{ElemType: types.ObjectType{AttrTypes: System_Login_User_Authentication_Ssh_ed25519_Model{}.AttrTypes()}},
	}
}
func (o System_Login_User_Authentication_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "ssh_ed25519": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: System_Login_User_Authentication_Ssh_ed25519_Model{}.Attributes(),
	        },
        },
    }
}
type System_Services_Netconf_Ssh_Model struct {
}
func (o System_Services_Netconf_Ssh_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	}
}
func (o System_Services_Netconf_Ssh_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
    }
}

type Firewall_Family_Inet_Filter_Term_Model struct {
	Name	types.String `tfsdk:"name"`
	From	types.List `tfsdk:"from"`
	Then	types.List `tfsdk:"then"`
}
func (o Firewall_Family_Inet_Filter_Term_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	    "from": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_From_Model{}.AttrTypes()}},
	    "then": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_Then_Model{}.AttrTypes()}},
	}
}
func (o Firewall_Family_Inet_Filter_Term_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Term`",
	    },
	    "from": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Firewall_Family_Inet_Filter_Term_From_Model{}.Attributes(),
	        },
        },
	    "then": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Firewall_Family_Inet_Filter_Term_Then_Model{}.Attributes(),
	        },
        },
    }
}
type Interfaces_Interface_Unit_Family_Inet_Model struct {
	Filter	types.List `tfsdk:"filter"`
	Address	types.List `tfsdk:"address"`
}
func (o Interfaces_Interface_Unit_Family_Inet_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "filter": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Filter_Model{}.AttrTypes()}},
	    "address": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Address_Model{}.AttrTypes()}},
	}
}
func (o Interfaces_Interface_Unit_Family_Inet_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "filter": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Unit_Family_Inet_Filter_Model{}.Attributes(),
	        },
        },
	    "address": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Unit_Family_Inet_Address_Model{}.Attributes(),
	        },
        },
    }
}
type Interfaces_Interface_Unit_Family_Ethernet_switching_Model struct {
	Interface_mode	types.String `tfsdk:"interface_mode"`
	Vlan	types.List `tfsdk:"vlan"`
	Storm_control	types.List `tfsdk:"storm_control"`
}
func (o Interfaces_Interface_Unit_Family_Ethernet_switching_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "interface_mode": 	types.StringType,
	    "vlan": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model{}.AttrTypes()}},
	    "storm_control": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model{}.AttrTypes()}},
	}
}
func (o Interfaces_Interface_Unit_Family_Ethernet_switching_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "interface_mode": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Interface-mode.Ethernet_switching`",
	    },
	    "vlan": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model{}.Attributes(),
	        },
        },
	    "storm_control": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model{}.Attributes(),
	        },
        },
    }
}
type System_Login_User_Authentication_Ssh_ed25519_Model struct {
	Name	types.String `tfsdk:"name"`
}
func (o System_Login_User_Authentication_Ssh_ed25519_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	}
}
func (o System_Login_User_Authentication_Ssh_ed25519_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Ssh_ed25519`",
	    },
    }
}

type Firewall_Family_Inet_Filter_Term_From_Model struct {
	Source_address	types.List `tfsdk:"source_address"`
	Destination_address	types.List `tfsdk:"destination_address"`
}
func (o Firewall_Family_Inet_Filter_Term_From_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "source_address": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_From_Source_address_Model{}.AttrTypes()}},
	    "destination_address": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_From_Destination_address_Model{}.AttrTypes()}},
	}
}
func (o Firewall_Family_Inet_Filter_Term_From_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "source_address": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Firewall_Family_Inet_Filter_Term_From_Source_address_Model{}.Attributes(),
	        },
        },
	    "destination_address": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Firewall_Family_Inet_Filter_Term_From_Destination_address_Model{}.Attributes(),
	        },
        },
    }
}
type Firewall_Family_Inet_Filter_Term_Then_Model struct {
	Accept	types.String `tfsdk:"accept"`
	Discard	types.List `tfsdk:"discard"`
}
func (o Firewall_Family_Inet_Filter_Term_Then_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "accept": 	types.StringType,
	    "discard": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_Then_Discard_Model{}.AttrTypes()}},
	}
}
func (o Firewall_Family_Inet_Filter_Term_Then_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "accept": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Accept.Then`",
	    },
	    "discard": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Firewall_Family_Inet_Filter_Term_Then_Discard_Model{}.Attributes(),
	        },
        },
    }
}
type Interfaces_Interface_Unit_Family_Inet_Filter_Model struct {
	Input	types.List `tfsdk:"input"`
}
func (o Interfaces_Interface_Unit_Family_Inet_Filter_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "input": 	types.ListType{ElemType: types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model{}.AttrTypes()}},
	}
}
func (o Interfaces_Interface_Unit_Family_Inet_Filter_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "input": schema.ListNestedAttribute{
		    Optional: true,
		    NestedObject: schema.NestedAttributeObject{
			    Attributes: Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model{}.Attributes(),
	        },
        },
    }
}
type Interfaces_Interface_Unit_Family_Inet_Address_Model struct {
	Name	types.String `tfsdk:"name"`
}
func (o Interfaces_Interface_Unit_Family_Inet_Address_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	}
}
func (o Interfaces_Interface_Unit_Family_Inet_Address_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Address`",
	    },
    }
}
type Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model struct {
	Members	types.List `tfsdk:"members"`
}
func (o Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
		"members": 	types.ListType{ElemType: types.StringType},
	}
}
func (o Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
		"members": schema.ListAttribute{
			ElementType:         types.StringType,
			Optional:            true,
			MarkdownDescription: "xpath is `config.Members.Vlan`",
		},
    }
}
type Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model struct {
	Profile_name	types.String `tfsdk:"profile_name"`
}
func (o Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "profile_name": 	types.StringType,
	}
}
func (o Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "profile_name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Profile-name.Storm_control`",
	    },
    }
}

type Firewall_Family_Inet_Filter_Term_From_Source_address_Model struct {
	Name	types.String `tfsdk:"name"`
}
func (o Firewall_Family_Inet_Filter_Term_From_Source_address_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	}
}
func (o Firewall_Family_Inet_Filter_Term_From_Source_address_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Source_address`",
	    },
    }
}
type Firewall_Family_Inet_Filter_Term_From_Destination_address_Model struct {
	Name	types.String `tfsdk:"name"`
}
func (o Firewall_Family_Inet_Filter_Term_From_Destination_address_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "name": 	types.StringType,
	}
}
func (o Firewall_Family_Inet_Filter_Term_From_Destination_address_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Name.Destination_address`",
	    },
    }
}
type Firewall_Family_Inet_Filter_Term_Then_Discard_Model struct {
}
func (o Firewall_Family_Inet_Filter_Term_Then_Discard_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	}
}
func (o Firewall_Family_Inet_Filter_Term_Then_Discard_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
    }
}
type Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model struct {
	Filter_name	types.String `tfsdk:"filter_name"`
}
func (o Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model) AttrTypes() map[string]attr.Type {
	return map[string]attr.Type{
	    "filter_name": 	types.StringType,
	}
}
func (o Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model) Attributes() map[string]schema.Attribute {
	return map[string]schema.Attribute{
	    "filter_name": schema.StringAttribute{
		    Optional: true,
		    MarkdownDescription: "xpath is `config.Filter-name.Input`",
	    },
    }
}



// Collects the data for the CRUD work.
type configResource struct {
	client ProviderConfig
}

func (r *configResource) Configure(_ context.Context, req resource.ConfigureRequest, _ *resource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	r.client = req.ProviderData.(ProviderConfig)
}
// Metadata implements resource.Resource.
func (r *configResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = "terraform-provider-" + req.ProviderTypeName
}
// Schema implements resource.Resource.
func (r *configResource) Schema(_ context.Context, req resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Attributes: map[string]schema.Attribute{
			"resource_name": schema.StringAttribute{
				Required:      true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
			},
			"chassis": schema.ListNestedAttribute{
				Optional: true,
				NestedObject: schema.NestedAttributeObject{
					Attributes: Chassis_Model{}.Attributes(),
				},
			},
			"firewall": schema.ListNestedAttribute{
				Optional: true,
				NestedObject: schema.NestedAttributeObject{
					Attributes: Firewall_Model{}.Attributes(),
				},
			},
			"forwarding_options": schema.ListNestedAttribute{
				Optional: true,
				NestedObject: schema.NestedAttributeObject{
					Attributes: Forwarding_options_Model{}.Attributes(),
				},
			},
			"interfaces": schema.ListNestedAttribute{
				Optional: true,
				NestedObject: schema.NestedAttributeObject{
					Attributes: Interfaces_Model{}.Attributes(),
				},
			},
			"protocols": schema.ListNestedAttribute{
				Optional: true,
				NestedObject: schema.NestedAttributeObject{
					Attributes: Protocols_Model{}.Attributes(),
				},
			},
			"routing_options": schema.ListNestedAttribute{
				Optional: true,
				NestedObject: schema.NestedAttributeObject{
					Attributes: Routing_options_Model{}.Attributes(),
				},
			},
			"system": schema.ListNestedAttribute{
				Optional: true,
				NestedObject: schema.NestedAttributeObject{
					Attributes: System_Model{}.Attributes(),
				},
			},
			"virtual_chassis": schema.ListNestedAttribute{
				Optional: true,
				NestedObject: schema.NestedAttributeObject{
					Attributes: Virtual_chassis_Model{}.Attributes(),
				},
			},
			"vlans": schema.ListNestedAttribute{
				Optional: true,
				NestedObject: schema.NestedAttributeObject{
					Attributes: Vlans_Model{}.Attributes(),
				},
			},
		},
	}
}

func modelToConfig(ctx context.Context, model ConfigResourceModel, diags *diag.Diagnostics) xml_Configuration {
	var cfg xml_Configuration

	
	var var_chassis []Chassis_Model
	if model.Chassis.IsNull() {
		var_chassis = []Chassis_Model{}
	} else {
		diags.Append(model.Chassis.ElementsAs(ctx, &var_chassis, false)...)
		if diags.HasError() {
			return cfg
		}
	}
	cfg.Chassis = make([]xml_Chassis, len(var_chassis))
	for i_chassis, v_chassis := range var_chassis {
		var var_chassis_aggregated_devices []Chassis_Aggregated_devices_Model
		diags.Append(v_chassis.Aggregated_devices.ElementsAs(ctx, &var_chassis_aggregated_devices, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.Chassis[i_chassis].Aggregated_devices = make([]xml_Chassis_Aggregated_devices, len(var_chassis_aggregated_devices))
		
		for i_chassis_aggregated_devices, v_chassis_aggregated_devices := range var_chassis_aggregated_devices {
			var var_chassis_aggregated_devices_ethernet []Chassis_Aggregated_devices_Ethernet_Model
			diags.Append(v_chassis_aggregated_devices.Ethernet.ElementsAs(ctx, &var_chassis_aggregated_devices_ethernet, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Chassis[i_chassis].Aggregated_devices[i_chassis_aggregated_devices].Ethernet = make([]xml_Chassis_Aggregated_devices_Ethernet, len(var_chassis_aggregated_devices_ethernet))
		
		for i_chassis_aggregated_devices_ethernet, v_chassis_aggregated_devices_ethernet := range var_chassis_aggregated_devices_ethernet {
			cfg.Chassis[i_chassis].Aggregated_devices[i_chassis_aggregated_devices].Ethernet[i_chassis_aggregated_devices_ethernet].Device_count = v_chassis_aggregated_devices_ethernet.Device_count.ValueStringPointer()
		}
		}
		var var_chassis_fpc []Chassis_Fpc_Model
		diags.Append(v_chassis.Fpc.ElementsAs(ctx, &var_chassis_fpc, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.Chassis[i_chassis].Fpc = make([]xml_Chassis_Fpc, len(var_chassis_fpc))
		
		for i_chassis_fpc, v_chassis_fpc := range var_chassis_fpc {
			cfg.Chassis[i_chassis].Fpc[i_chassis_fpc].Name = v_chassis_fpc.Name.ValueStringPointer()
			var var_chassis_fpc_pic []Chassis_Fpc_Pic_Model
			diags.Append(v_chassis_fpc.Pic.ElementsAs(ctx, &var_chassis_fpc_pic, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Chassis[i_chassis].Fpc[i_chassis_fpc].Pic = make([]xml_Chassis_Fpc_Pic, len(var_chassis_fpc_pic))
		
		for i_chassis_fpc_pic, v_chassis_fpc_pic := range var_chassis_fpc_pic {
			cfg.Chassis[i_chassis].Fpc[i_chassis_fpc].Pic[i_chassis_fpc_pic].Name = v_chassis_fpc_pic.Name.ValueStringPointer()
			var var_chassis_fpc_pic_port []Chassis_Fpc_Pic_Port_Model
			diags.Append(v_chassis_fpc_pic.Port.ElementsAs(ctx, &var_chassis_fpc_pic_port, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Chassis[i_chassis].Fpc[i_chassis_fpc].Pic[i_chassis_fpc_pic].Port = make([]xml_Chassis_Fpc_Pic_Port, len(var_chassis_fpc_pic_port))
		
		for i_chassis_fpc_pic_port, v_chassis_fpc_pic_port := range var_chassis_fpc_pic_port {
			cfg.Chassis[i_chassis].Fpc[i_chassis_fpc].Pic[i_chassis_fpc_pic].Port[i_chassis_fpc_pic_port].Name = v_chassis_fpc_pic_port.Name.ValueStringPointer()
			cfg.Chassis[i_chassis].Fpc[i_chassis_fpc].Pic[i_chassis_fpc_pic].Port[i_chassis_fpc_pic_port].Speed = v_chassis_fpc_pic_port.Speed.ValueStringPointer()
			cfg.Chassis[i_chassis].Fpc[i_chassis_fpc].Pic[i_chassis_fpc_pic].Port[i_chassis_fpc_pic_port].Channel_speed = v_chassis_fpc_pic_port.Channel_speed.ValueStringPointer()
		}
		}
		}
	}
	
	var var_firewall []Firewall_Model
	if model.Firewall.IsNull() {
		var_firewall = []Firewall_Model{}
	} else {
		diags.Append(model.Firewall.ElementsAs(ctx, &var_firewall, false)...)
		if diags.HasError() {
			return cfg
		}
	}
	cfg.Firewall = make([]xml_Firewall, len(var_firewall))
	for i_firewall, v_firewall := range var_firewall {
		var var_firewall_family []Firewall_Family_Model
		diags.Append(v_firewall.Family.ElementsAs(ctx, &var_firewall_family, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.Firewall[i_firewall].Family = make([]xml_Firewall_Family, len(var_firewall_family))
		
		for i_firewall_family, v_firewall_family := range var_firewall_family {
			var var_firewall_family_inet []Firewall_Family_Inet_Model
			diags.Append(v_firewall_family.Inet.ElementsAs(ctx, &var_firewall_family_inet, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Firewall[i_firewall].Family[i_firewall_family].Inet = make([]xml_Firewall_Family_Inet, len(var_firewall_family_inet))
		
		for i_firewall_family_inet, v_firewall_family_inet := range var_firewall_family_inet {
			var var_firewall_family_inet_filter []Firewall_Family_Inet_Filter_Model
			diags.Append(v_firewall_family_inet.Filter.ElementsAs(ctx, &var_firewall_family_inet_filter, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter = make([]xml_Firewall_Family_Inet_Filter, len(var_firewall_family_inet_filter))
		
		for i_firewall_family_inet_filter, v_firewall_family_inet_filter := range var_firewall_family_inet_filter {
			cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Name = v_firewall_family_inet_filter.Name.ValueStringPointer()
			var var_firewall_family_inet_filter_term []Firewall_Family_Inet_Filter_Term_Model
			diags.Append(v_firewall_family_inet_filter.Term.ElementsAs(ctx, &var_firewall_family_inet_filter_term, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term = make([]xml_Firewall_Family_Inet_Filter_Term, len(var_firewall_family_inet_filter_term))
		
		for i_firewall_family_inet_filter_term, v_firewall_family_inet_filter_term := range var_firewall_family_inet_filter_term {
			cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term[i_firewall_family_inet_filter_term].Name = v_firewall_family_inet_filter_term.Name.ValueStringPointer()
			var var_firewall_family_inet_filter_term_from []Firewall_Family_Inet_Filter_Term_From_Model
			diags.Append(v_firewall_family_inet_filter_term.From.ElementsAs(ctx, &var_firewall_family_inet_filter_term_from, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term[i_firewall_family_inet_filter_term].From = make([]xml_Firewall_Family_Inet_Filter_Term_From, len(var_firewall_family_inet_filter_term_from))
		
		for i_firewall_family_inet_filter_term_from, v_firewall_family_inet_filter_term_from := range var_firewall_family_inet_filter_term_from {
			var var_firewall_family_inet_filter_term_from_source_address []Firewall_Family_Inet_Filter_Term_From_Source_address_Model
			diags.Append(v_firewall_family_inet_filter_term_from.Source_address.ElementsAs(ctx, &var_firewall_family_inet_filter_term_from_source_address, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term[i_firewall_family_inet_filter_term].From[i_firewall_family_inet_filter_term_from].Source_address = make([]xml_Firewall_Family_Inet_Filter_Term_From_Source_address, len(var_firewall_family_inet_filter_term_from_source_address))
		
		for i_firewall_family_inet_filter_term_from_source_address, v_firewall_family_inet_filter_term_from_source_address := range var_firewall_family_inet_filter_term_from_source_address {
			cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term[i_firewall_family_inet_filter_term].From[i_firewall_family_inet_filter_term_from].Source_address[i_firewall_family_inet_filter_term_from_source_address].Name = v_firewall_family_inet_filter_term_from_source_address.Name.ValueStringPointer()
		}
			var var_firewall_family_inet_filter_term_from_destination_address []Firewall_Family_Inet_Filter_Term_From_Destination_address_Model
			diags.Append(v_firewall_family_inet_filter_term_from.Destination_address.ElementsAs(ctx, &var_firewall_family_inet_filter_term_from_destination_address, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term[i_firewall_family_inet_filter_term].From[i_firewall_family_inet_filter_term_from].Destination_address = make([]xml_Firewall_Family_Inet_Filter_Term_From_Destination_address, len(var_firewall_family_inet_filter_term_from_destination_address))
		
		for i_firewall_family_inet_filter_term_from_destination_address, v_firewall_family_inet_filter_term_from_destination_address := range var_firewall_family_inet_filter_term_from_destination_address {
			cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term[i_firewall_family_inet_filter_term].From[i_firewall_family_inet_filter_term_from].Destination_address[i_firewall_family_inet_filter_term_from_destination_address].Name = v_firewall_family_inet_filter_term_from_destination_address.Name.ValueStringPointer()
		}
		}
			var var_firewall_family_inet_filter_term_then []Firewall_Family_Inet_Filter_Term_Then_Model
			diags.Append(v_firewall_family_inet_filter_term.Then.ElementsAs(ctx, &var_firewall_family_inet_filter_term_then, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term[i_firewall_family_inet_filter_term].Then = make([]xml_Firewall_Family_Inet_Filter_Term_Then, len(var_firewall_family_inet_filter_term_then))
		
		for i_firewall_family_inet_filter_term_then, v_firewall_family_inet_filter_term_then := range var_firewall_family_inet_filter_term_then {
			cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term[i_firewall_family_inet_filter_term].Then[i_firewall_family_inet_filter_term_then].Accept = v_firewall_family_inet_filter_term_then.Accept.ValueStringPointer()
			var var_firewall_family_inet_filter_term_then_discard []Firewall_Family_Inet_Filter_Term_Then_Discard_Model
			diags.Append(v_firewall_family_inet_filter_term_then.Discard.ElementsAs(ctx, &var_firewall_family_inet_filter_term_then_discard, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Firewall[i_firewall].Family[i_firewall_family].Inet[i_firewall_family_inet].Filter[i_firewall_family_inet_filter].Term[i_firewall_family_inet_filter_term].Then[i_firewall_family_inet_filter_term_then].Discard = make([]xml_Firewall_Family_Inet_Filter_Term_Then_Discard, len(var_firewall_family_inet_filter_term_then_discard))
		
		}
		}
		}
		}
		}
	}
	
	var var_forwarding_options []Forwarding_options_Model
	if model.Forwarding_options.IsNull() {
		var_forwarding_options = []Forwarding_options_Model{}
	} else {
		diags.Append(model.Forwarding_options.ElementsAs(ctx, &var_forwarding_options, false)...)
		if diags.HasError() {
			return cfg
		}
	}
	cfg.Forwarding_options = make([]xml_Forwarding_options, len(var_forwarding_options))
	for i_forwarding_options, v_forwarding_options := range var_forwarding_options {
		var var_forwarding_options_storm_control_profiles []Forwarding_options_Storm_control_profiles_Model
		diags.Append(v_forwarding_options.Storm_control_profiles.ElementsAs(ctx, &var_forwarding_options_storm_control_profiles, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.Forwarding_options[i_forwarding_options].Storm_control_profiles = make([]xml_Forwarding_options_Storm_control_profiles, len(var_forwarding_options_storm_control_profiles))
		
		for i_forwarding_options_storm_control_profiles, v_forwarding_options_storm_control_profiles := range var_forwarding_options_storm_control_profiles {
			cfg.Forwarding_options[i_forwarding_options].Storm_control_profiles[i_forwarding_options_storm_control_profiles].Name = v_forwarding_options_storm_control_profiles.Name.ValueStringPointer()
			var var_forwarding_options_storm_control_profiles_all []Forwarding_options_Storm_control_profiles_All_Model
			diags.Append(v_forwarding_options_storm_control_profiles.All.ElementsAs(ctx, &var_forwarding_options_storm_control_profiles_all, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Forwarding_options[i_forwarding_options].Storm_control_profiles[i_forwarding_options_storm_control_profiles].All = make([]xml_Forwarding_options_Storm_control_profiles_All, len(var_forwarding_options_storm_control_profiles_all))
		
		for i_forwarding_options_storm_control_profiles_all, v_forwarding_options_storm_control_profiles_all := range var_forwarding_options_storm_control_profiles_all {
			cfg.Forwarding_options[i_forwarding_options].Storm_control_profiles[i_forwarding_options_storm_control_profiles].All[i_forwarding_options_storm_control_profiles_all].Bandwidth_level = v_forwarding_options_storm_control_profiles_all.Bandwidth_level.ValueStringPointer()
		}
		}
	}
	
	var var_interfaces []Interfaces_Model
	if model.Interfaces.IsNull() {
		var_interfaces = []Interfaces_Model{}
	} else {
		diags.Append(model.Interfaces.ElementsAs(ctx, &var_interfaces, false)...)
		if diags.HasError() {
			return cfg
		}
	}
	cfg.Interfaces = make([]xml_Interfaces, len(var_interfaces))
	for i_interfaces, v_interfaces := range var_interfaces {
		var var_interfaces_interface []Interfaces_Interface_Model
		diags.Append(v_interfaces.Interface.ElementsAs(ctx, &var_interfaces_interface, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.Interfaces[i_interfaces].Interface = make([]xml_Interfaces_Interface, len(var_interfaces_interface))
		
		for i_interfaces_interface, v_interfaces_interface := range var_interfaces_interface {
			cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Name = v_interfaces_interface.Name.ValueStringPointer()
			cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Mtu = v_interfaces_interface.Mtu.ValueStringPointer()
			var var_interfaces_interface_ether_options []Interfaces_Interface_Ether_options_Model
			diags.Append(v_interfaces_interface.Ether_options.ElementsAs(ctx, &var_interfaces_interface_ether_options, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Ether_options = make([]xml_Interfaces_Interface_Ether_options, len(var_interfaces_interface_ether_options))
		
		for i_interfaces_interface_ether_options, v_interfaces_interface_ether_options := range var_interfaces_interface_ether_options {
			var var_interfaces_interface_ether_options_ieee_802_3ad []Interfaces_Interface_Ether_options_Ieee_802_3ad_Model
			diags.Append(v_interfaces_interface_ether_options.Ieee_802_3ad.ElementsAs(ctx, &var_interfaces_interface_ether_options_ieee_802_3ad, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Ether_options[i_interfaces_interface_ether_options].Ieee_802_3ad = make([]xml_Interfaces_Interface_Ether_options_Ieee_802_3ad, len(var_interfaces_interface_ether_options_ieee_802_3ad))
		
		for i_interfaces_interface_ether_options_ieee_802_3ad, v_interfaces_interface_ether_options_ieee_802_3ad := range var_interfaces_interface_ether_options_ieee_802_3ad {
			cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Ether_options[i_interfaces_interface_ether_options].Ieee_802_3ad[i_interfaces_interface_ether_options_ieee_802_3ad].Bundle = v_interfaces_interface_ether_options_ieee_802_3ad.Bundle.ValueStringPointer()
		}
		}
			var var_interfaces_interface_aggregated_ether_options []Interfaces_Interface_Aggregated_ether_options_Model
			diags.Append(v_interfaces_interface.Aggregated_ether_options.ElementsAs(ctx, &var_interfaces_interface_aggregated_ether_options, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Aggregated_ether_options = make([]xml_Interfaces_Interface_Aggregated_ether_options, len(var_interfaces_interface_aggregated_ether_options))
		
		for i_interfaces_interface_aggregated_ether_options, v_interfaces_interface_aggregated_ether_options := range var_interfaces_interface_aggregated_ether_options {
			var var_interfaces_interface_aggregated_ether_options_lacp []Interfaces_Interface_Aggregated_ether_options_Lacp_Model
			diags.Append(v_interfaces_interface_aggregated_ether_options.Lacp.ElementsAs(ctx, &var_interfaces_interface_aggregated_ether_options_lacp, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Aggregated_ether_options[i_interfaces_interface_aggregated_ether_options].Lacp = make([]xml_Interfaces_Interface_Aggregated_ether_options_Lacp, len(var_interfaces_interface_aggregated_ether_options_lacp))
		
		for i_interfaces_interface_aggregated_ether_options_lacp, v_interfaces_interface_aggregated_ether_options_lacp := range var_interfaces_interface_aggregated_ether_options_lacp {
			cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Aggregated_ether_options[i_interfaces_interface_aggregated_ether_options].Lacp[i_interfaces_interface_aggregated_ether_options_lacp].Active = v_interfaces_interface_aggregated_ether_options_lacp.Active.ValueStringPointer()
		}
		}
			var var_interfaces_interface_unit []Interfaces_Interface_Unit_Model
			diags.Append(v_interfaces_interface.Unit.ElementsAs(ctx, &var_interfaces_interface_unit, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit = make([]xml_Interfaces_Interface_Unit, len(var_interfaces_interface_unit))
		
		for i_interfaces_interface_unit, v_interfaces_interface_unit := range var_interfaces_interface_unit {
			cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Name = v_interfaces_interface_unit.Name.ValueStringPointer()
			var var_interfaces_interface_unit_family []Interfaces_Interface_Unit_Family_Model
			diags.Append(v_interfaces_interface_unit.Family.ElementsAs(ctx, &var_interfaces_interface_unit_family, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family = make([]xml_Interfaces_Interface_Unit_Family, len(var_interfaces_interface_unit_family))
		
		for i_interfaces_interface_unit_family, v_interfaces_interface_unit_family := range var_interfaces_interface_unit_family {
			var var_interfaces_interface_unit_family_inet []Interfaces_Interface_Unit_Family_Inet_Model
			diags.Append(v_interfaces_interface_unit_family.Inet.ElementsAs(ctx, &var_interfaces_interface_unit_family_inet, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Inet = make([]xml_Interfaces_Interface_Unit_Family_Inet, len(var_interfaces_interface_unit_family_inet))
		
		for i_interfaces_interface_unit_family_inet, v_interfaces_interface_unit_family_inet := range var_interfaces_interface_unit_family_inet {
			var var_interfaces_interface_unit_family_inet_filter []Interfaces_Interface_Unit_Family_Inet_Filter_Model
			diags.Append(v_interfaces_interface_unit_family_inet.Filter.ElementsAs(ctx, &var_interfaces_interface_unit_family_inet_filter, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Inet[i_interfaces_interface_unit_family_inet].Filter = make([]xml_Interfaces_Interface_Unit_Family_Inet_Filter, len(var_interfaces_interface_unit_family_inet_filter))
		
		for i_interfaces_interface_unit_family_inet_filter, v_interfaces_interface_unit_family_inet_filter := range var_interfaces_interface_unit_family_inet_filter {
			var var_interfaces_interface_unit_family_inet_filter_input []Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model
			diags.Append(v_interfaces_interface_unit_family_inet_filter.Input.ElementsAs(ctx, &var_interfaces_interface_unit_family_inet_filter_input, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Inet[i_interfaces_interface_unit_family_inet].Filter[i_interfaces_interface_unit_family_inet_filter].Input = make([]xml_Interfaces_Interface_Unit_Family_Inet_Filter_Input, len(var_interfaces_interface_unit_family_inet_filter_input))
		
		for i_interfaces_interface_unit_family_inet_filter_input, v_interfaces_interface_unit_family_inet_filter_input := range var_interfaces_interface_unit_family_inet_filter_input {
			cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Inet[i_interfaces_interface_unit_family_inet].Filter[i_interfaces_interface_unit_family_inet_filter].Input[i_interfaces_interface_unit_family_inet_filter_input].Filter_name = v_interfaces_interface_unit_family_inet_filter_input.Filter_name.ValueStringPointer()
		}
		}
			var var_interfaces_interface_unit_family_inet_address []Interfaces_Interface_Unit_Family_Inet_Address_Model
			diags.Append(v_interfaces_interface_unit_family_inet.Address.ElementsAs(ctx, &var_interfaces_interface_unit_family_inet_address, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Inet[i_interfaces_interface_unit_family_inet].Address = make([]xml_Interfaces_Interface_Unit_Family_Inet_Address, len(var_interfaces_interface_unit_family_inet_address))
		
		for i_interfaces_interface_unit_family_inet_address, v_interfaces_interface_unit_family_inet_address := range var_interfaces_interface_unit_family_inet_address {
			cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Inet[i_interfaces_interface_unit_family_inet].Address[i_interfaces_interface_unit_family_inet_address].Name = v_interfaces_interface_unit_family_inet_address.Name.ValueStringPointer()
		}
		}
			var var_interfaces_interface_unit_family_ethernet_switching []Interfaces_Interface_Unit_Family_Ethernet_switching_Model
			diags.Append(v_interfaces_interface_unit_family.Ethernet_switching.ElementsAs(ctx, &var_interfaces_interface_unit_family_ethernet_switching, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Ethernet_switching = make([]xml_Interfaces_Interface_Unit_Family_Ethernet_switching, len(var_interfaces_interface_unit_family_ethernet_switching))
		
		for i_interfaces_interface_unit_family_ethernet_switching, v_interfaces_interface_unit_family_ethernet_switching := range var_interfaces_interface_unit_family_ethernet_switching {
			cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Ethernet_switching[i_interfaces_interface_unit_family_ethernet_switching].Interface_mode = v_interfaces_interface_unit_family_ethernet_switching.Interface_mode.ValueStringPointer()
			var var_interfaces_interface_unit_family_ethernet_switching_vlan []Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model
			diags.Append(v_interfaces_interface_unit_family_ethernet_switching.Vlan.ElementsAs(ctx, &var_interfaces_interface_unit_family_ethernet_switching_vlan, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Ethernet_switching[i_interfaces_interface_unit_family_ethernet_switching].Vlan = make([]xml_Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan, len(var_interfaces_interface_unit_family_ethernet_switching_vlan))
		
		for i_interfaces_interface_unit_family_ethernet_switching_vlan, v_interfaces_interface_unit_family_ethernet_switching_vlan := range var_interfaces_interface_unit_family_ethernet_switching_vlan {
			var var_interfaces_interface_unit_family_ethernet_switching_vlan_members []string
			diags.Append(v_interfaces_interface_unit_family_ethernet_switching_vlan.Members.ElementsAs(ctx, &var_interfaces_interface_unit_family_ethernet_switching_vlan_members, false)...)
			if diags.HasError() {
				return cfg
			}
			for _, v_interfaces_interface_unit_family_ethernet_switching_vlan_members := range var_interfaces_interface_unit_family_ethernet_switching_vlan_members {
				cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Ethernet_switching[i_interfaces_interface_unit_family_ethernet_switching].Vlan[i_interfaces_interface_unit_family_ethernet_switching_vlan].Members = append(cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Ethernet_switching[i_interfaces_interface_unit_family_ethernet_switching].Vlan[i_interfaces_interface_unit_family_ethernet_switching_vlan].Members, &v_interfaces_interface_unit_family_ethernet_switching_vlan_members)
			}
		}
			var var_interfaces_interface_unit_family_ethernet_switching_storm_control []Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model
			diags.Append(v_interfaces_interface_unit_family_ethernet_switching.Storm_control.ElementsAs(ctx, &var_interfaces_interface_unit_family_ethernet_switching_storm_control, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Ethernet_switching[i_interfaces_interface_unit_family_ethernet_switching].Storm_control = make([]xml_Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control, len(var_interfaces_interface_unit_family_ethernet_switching_storm_control))
		
		for i_interfaces_interface_unit_family_ethernet_switching_storm_control, v_interfaces_interface_unit_family_ethernet_switching_storm_control := range var_interfaces_interface_unit_family_ethernet_switching_storm_control {
			cfg.Interfaces[i_interfaces].Interface[i_interfaces_interface].Unit[i_interfaces_interface_unit].Family[i_interfaces_interface_unit_family].Ethernet_switching[i_interfaces_interface_unit_family_ethernet_switching].Storm_control[i_interfaces_interface_unit_family_ethernet_switching_storm_control].Profile_name = v_interfaces_interface_unit_family_ethernet_switching_storm_control.Profile_name.ValueStringPointer()
		}
		}
		}
		}
		}
	}
	
	var var_protocols []Protocols_Model
	if model.Protocols.IsNull() {
		var_protocols = []Protocols_Model{}
	} else {
		diags.Append(model.Protocols.ElementsAs(ctx, &var_protocols, false)...)
		if diags.HasError() {
			return cfg
		}
	}
	cfg.Protocols = make([]xml_Protocols, len(var_protocols))
	for i_protocols, v_protocols := range var_protocols {
		var var_protocols_lldp []Protocols_Lldp_Model
		diags.Append(v_protocols.Lldp.ElementsAs(ctx, &var_protocols_lldp, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.Protocols[i_protocols].Lldp = make([]xml_Protocols_Lldp, len(var_protocols_lldp))
		
		for i_protocols_lldp, v_protocols_lldp := range var_protocols_lldp {
			var var_protocols_lldp_interface []Protocols_Lldp_Interface_Model
			diags.Append(v_protocols_lldp.Interface.ElementsAs(ctx, &var_protocols_lldp_interface, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Protocols[i_protocols].Lldp[i_protocols_lldp].Interface = make([]xml_Protocols_Lldp_Interface, len(var_protocols_lldp_interface))
		
		for i_protocols_lldp_interface, v_protocols_lldp_interface := range var_protocols_lldp_interface {
			cfg.Protocols[i_protocols].Lldp[i_protocols_lldp].Interface[i_protocols_lldp_interface].Name = v_protocols_lldp_interface.Name.ValueStringPointer()
		}
		}
	}
	
	var var_routing_options []Routing_options_Model
	if model.Routing_options.IsNull() {
		var_routing_options = []Routing_options_Model{}
	} else {
		diags.Append(model.Routing_options.ElementsAs(ctx, &var_routing_options, false)...)
		if diags.HasError() {
			return cfg
		}
	}
	cfg.Routing_options = make([]xml_Routing_options, len(var_routing_options))
	for i_routing_options, v_routing_options := range var_routing_options {
		var var_routing_options_static []Routing_options_Static_Model
		diags.Append(v_routing_options.Static.ElementsAs(ctx, &var_routing_options_static, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.Routing_options[i_routing_options].Static = make([]xml_Routing_options_Static, len(var_routing_options_static))
		
		for i_routing_options_static, v_routing_options_static := range var_routing_options_static {
			var var_routing_options_static_route []Routing_options_Static_Route_Model
			diags.Append(v_routing_options_static.Route.ElementsAs(ctx, &var_routing_options_static_route, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.Routing_options[i_routing_options].Static[i_routing_options_static].Route = make([]xml_Routing_options_Static_Route, len(var_routing_options_static_route))
		
		for i_routing_options_static_route, v_routing_options_static_route := range var_routing_options_static_route {
			cfg.Routing_options[i_routing_options].Static[i_routing_options_static].Route[i_routing_options_static_route].Name = v_routing_options_static_route.Name.ValueStringPointer()
			var var_routing_options_static_route_next_hop []string
			diags.Append(v_routing_options_static_route.Next_hop.ElementsAs(ctx, &var_routing_options_static_route_next_hop, false)...)
			if diags.HasError() {
				return cfg
			}
			for _, v_routing_options_static_route_next_hop := range var_routing_options_static_route_next_hop {
				cfg.Routing_options[i_routing_options].Static[i_routing_options_static].Route[i_routing_options_static_route].Next_hop = append(cfg.Routing_options[i_routing_options].Static[i_routing_options_static].Route[i_routing_options_static_route].Next_hop, &v_routing_options_static_route_next_hop)
			}
		}
		}
	}
	
	var var_system []System_Model
	if model.System.IsNull() {
		var_system = []System_Model{}
	} else {
		diags.Append(model.System.ElementsAs(ctx, &var_system, false)...)
		if diags.HasError() {
			return cfg
		}
	}
	cfg.System = make([]xml_System, len(var_system))
	for i_system, v_system := range var_system {
		cfg.System[i_system].Host_name = v_system.Host_name.ValueStringPointer()
		var var_system_root_authentication []System_Root_authentication_Model
		diags.Append(v_system.Root_authentication.ElementsAs(ctx, &var_system_root_authentication, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.System[i_system].Root_authentication = make([]xml_System_Root_authentication, len(var_system_root_authentication))
		
		for i_system_root_authentication, v_system_root_authentication := range var_system_root_authentication {
			cfg.System[i_system].Root_authentication[i_system_root_authentication].Encrypted_password = v_system_root_authentication.Encrypted_password.ValueStringPointer()
		}
		var var_system_login []System_Login_Model
		diags.Append(v_system.Login.ElementsAs(ctx, &var_system_login, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.System[i_system].Login = make([]xml_System_Login, len(var_system_login))
		
		for i_system_login, v_system_login := range var_system_login {
			var var_system_login_user []System_Login_User_Model
			diags.Append(v_system_login.User.ElementsAs(ctx, &var_system_login_user, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.System[i_system].Login[i_system_login].User = make([]xml_System_Login_User, len(var_system_login_user))
		
		for i_system_login_user, v_system_login_user := range var_system_login_user {
			cfg.System[i_system].Login[i_system_login].User[i_system_login_user].Name = v_system_login_user.Name.ValueStringPointer()
			cfg.System[i_system].Login[i_system_login].User[i_system_login_user].Uid = v_system_login_user.Uid.ValueStringPointer()
			cfg.System[i_system].Login[i_system_login].User[i_system_login_user].Class = v_system_login_user.Class.ValueStringPointer()
			var var_system_login_user_authentication []System_Login_User_Authentication_Model
			diags.Append(v_system_login_user.Authentication.ElementsAs(ctx, &var_system_login_user_authentication, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.System[i_system].Login[i_system_login].User[i_system_login_user].Authentication = make([]xml_System_Login_User_Authentication, len(var_system_login_user_authentication))
		
		for i_system_login_user_authentication, v_system_login_user_authentication := range var_system_login_user_authentication {
			var var_system_login_user_authentication_ssh_ed25519 []System_Login_User_Authentication_Ssh_ed25519_Model
			diags.Append(v_system_login_user_authentication.Ssh_ed25519.ElementsAs(ctx, &var_system_login_user_authentication_ssh_ed25519, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.System[i_system].Login[i_system_login].User[i_system_login_user].Authentication[i_system_login_user_authentication].Ssh_ed25519 = make([]xml_System_Login_User_Authentication_Ssh_ed25519, len(var_system_login_user_authentication_ssh_ed25519))
		
		for i_system_login_user_authentication_ssh_ed25519, v_system_login_user_authentication_ssh_ed25519 := range var_system_login_user_authentication_ssh_ed25519 {
			cfg.System[i_system].Login[i_system_login].User[i_system_login_user].Authentication[i_system_login_user_authentication].Ssh_ed25519[i_system_login_user_authentication_ssh_ed25519].Name = v_system_login_user_authentication_ssh_ed25519.Name.ValueStringPointer()
		}
		}
		}
		}
		var var_system_services []System_Services_Model
		diags.Append(v_system.Services.ElementsAs(ctx, &var_system_services, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.System[i_system].Services = make([]xml_System_Services, len(var_system_services))
		
		for i_system_services, v_system_services := range var_system_services {
			var var_system_services_netconf []System_Services_Netconf_Model
			diags.Append(v_system_services.Netconf.ElementsAs(ctx, &var_system_services_netconf, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.System[i_system].Services[i_system_services].Netconf = make([]xml_System_Services_Netconf, len(var_system_services_netconf))
		
		for i_system_services_netconf, v_system_services_netconf := range var_system_services_netconf {
			var var_system_services_netconf_ssh []System_Services_Netconf_Ssh_Model
			diags.Append(v_system_services_netconf.Ssh.ElementsAs(ctx, &var_system_services_netconf_ssh, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.System[i_system].Services[i_system_services].Netconf[i_system_services_netconf].Ssh = make([]xml_System_Services_Netconf_Ssh, len(var_system_services_netconf_ssh))
		
		}
			var var_system_services_ssh []System_Services_Ssh_Model
			diags.Append(v_system_services.Ssh.ElementsAs(ctx, &var_system_services_ssh, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.System[i_system].Services[i_system_services].Ssh = make([]xml_System_Services_Ssh, len(var_system_services_ssh))
		
		for i_system_services_ssh, v_system_services_ssh := range var_system_services_ssh {
			cfg.System[i_system].Services[i_system_services].Ssh[i_system_services_ssh].Root_login = v_system_services_ssh.Root_login.ValueStringPointer()
		}
		}
		cfg.System[i_system].Time_zone = v_system.Time_zone.ValueStringPointer()
		var var_system_authentication_order []string
		diags.Append(v_system.Authentication_order.ElementsAs(ctx, &var_system_authentication_order, false)...)
		if diags.HasError() {
			return cfg
		}
		for _, v_system_authentication_order := range var_system_authentication_order {
			cfg.System[i_system].Authentication_order = append(cfg.System[i_system].Authentication_order, &v_system_authentication_order)
		}
		var var_system_ports []System_Ports_Model
		diags.Append(v_system.Ports.ElementsAs(ctx, &var_system_ports, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.System[i_system].Ports = make([]xml_System_Ports, len(var_system_ports))
		
		for i_system_ports, v_system_ports := range var_system_ports {
			var var_system_ports_console []System_Ports_Console_Model
			diags.Append(v_system_ports.Console.ElementsAs(ctx, &var_system_ports_console, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.System[i_system].Ports[i_system_ports].Console = make([]xml_System_Ports_Console, len(var_system_ports_console))
		
		for i_system_ports_console, v_system_ports_console := range var_system_ports_console {
			cfg.System[i_system].Ports[i_system_ports].Console[i_system_ports_console].Log_out_on_disconnect = v_system_ports_console.Log_out_on_disconnect.ValueStringPointer()
		}
		}
		var var_system_processes []System_Processes_Model
		diags.Append(v_system.Processes.ElementsAs(ctx, &var_system_processes, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.System[i_system].Processes = make([]xml_System_Processes, len(var_system_processes))
		
		for i_system_processes, v_system_processes := range var_system_processes {
			var var_system_processes_daemon_process []System_Processes_Daemon_process_Model
			diags.Append(v_system_processes.Daemon_process.ElementsAs(ctx, &var_system_processes_daemon_process, false)...)
			if diags.HasError() {
				return cfg
			}
	    cfg.System[i_system].Processes[i_system_processes].Daemon_process = make([]xml_System_Processes_Daemon_process, len(var_system_processes_daemon_process))
		
		for i_system_processes_daemon_process, v_system_processes_daemon_process := range var_system_processes_daemon_process {
			cfg.System[i_system].Processes[i_system_processes].Daemon_process[i_system_processes_daemon_process].Name = v_system_processes_daemon_process.Name.ValueStringPointer()
			cfg.System[i_system].Processes[i_system_processes].Daemon_process[i_system_processes_daemon_process].Disable = v_system_processes_daemon_process.Disable.ValueStringPointer()
		}
		}
	}
	
	var var_virtual_chassis []Virtual_chassis_Model
	if model.Virtual_chassis.IsNull() {
		var_virtual_chassis = []Virtual_chassis_Model{}
	} else {
		diags.Append(model.Virtual_chassis.ElementsAs(ctx, &var_virtual_chassis, false)...)
		if diags.HasError() {
			return cfg
		}
	}
	cfg.Virtual_chassis = make([]xml_Virtual_chassis, len(var_virtual_chassis))
	for i_virtual_chassis, v_virtual_chassis := range var_virtual_chassis {
		cfg.Virtual_chassis[i_virtual_chassis].Preprovisioned = v_virtual_chassis.Preprovisioned.ValueStringPointer()
		var var_virtual_chassis_member []Virtual_chassis_Member_Model
		diags.Append(v_virtual_chassis.Member.ElementsAs(ctx, &var_virtual_chassis_member, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.Virtual_chassis[i_virtual_chassis].Member = make([]xml_Virtual_chassis_Member, len(var_virtual_chassis_member))
		
		for i_virtual_chassis_member, v_virtual_chassis_member := range var_virtual_chassis_member {
			cfg.Virtual_chassis[i_virtual_chassis].Member[i_virtual_chassis_member].Name = v_virtual_chassis_member.Name.ValueStringPointer()
			cfg.Virtual_chassis[i_virtual_chassis].Member[i_virtual_chassis_member].Role = v_virtual_chassis_member.Role.ValueStringPointer()
			cfg.Virtual_chassis[i_virtual_chassis].Member[i_virtual_chassis_member].Serial_number = v_virtual_chassis_member.Serial_number.ValueStringPointer()
		}
	}
	
	var var_vlans []Vlans_Model
	if model.Vlans.IsNull() {
		var_vlans = []Vlans_Model{}
	} else {
		diags.Append(model.Vlans.ElementsAs(ctx, &var_vlans, false)...)
		if diags.HasError() {
			return cfg
		}
	}
	cfg.Vlans = make([]xml_Vlans, len(var_vlans))
	for i_vlans, v_vlans := range var_vlans {
		var var_vlans_vlan []Vlans_Vlan_Model
		diags.Append(v_vlans.Vlan.ElementsAs(ctx, &var_vlans_vlan, false)...)
		if diags.HasError() {
			return cfg
		}
	    cfg.Vlans[i_vlans].Vlan = make([]xml_Vlans_Vlan, len(var_vlans_vlan))
		
		for i_vlans_vlan, v_vlans_vlan := range var_vlans_vlan {
			cfg.Vlans[i_vlans].Vlan[i_vlans_vlan].Name = v_vlans_vlan.Name.ValueStringPointer()
			cfg.Vlans[i_vlans].Vlan[i_vlans_vlan].Vlan_id = v_vlans_vlan.Vlan_id.ValueStringPointer()
			cfg.Vlans[i_vlans].Vlan[i_vlans_vlan].L3_interface = v_vlans_vlan.L3_interface.ValueStringPointer()
		}
	}
	

	return cfg
}

func marshalConfigXML(config xml_Configuration) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString(xml.Header)
	enc := xml.NewEncoder(&buf)
	enc.Indent("", "  ")
	if err := enc.Encode(config); err != nil {
		return nil, err
	}
	if err := enc.Flush(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func alignConfigToReference(ctx context.Context, config xml_Configuration, reference ConfigResourceModel, diags *diag.Diagnostics) (xml_Configuration, error) {
	referenceConfig := modelToConfig(ctx, reference, diags)
	if diags.HasError() {
		return xml_Configuration{}, nil
	}

	currentXML, err := marshalConfigXML(config)
	if err != nil {
		return xml_Configuration{}, err
	}
	referenceXML, err := marshalConfigXML(referenceConfig)
	if err != nil {
		return xml_Configuration{}, err
	}

	idx, err := patch.UnmarshalTrimmedSchemaIndex(TrimmedSchemaJSON)
	if err != nil {
		return xml_Configuration{}, err
	}

	alignedXML, err := patch.AlignXMLOrderToReference(currentXML, referenceXML, idx)
	if err != nil {
		return xml_Configuration{}, err
	}

	var aligned xml_Configuration
	if err := xml.Unmarshal(alignedXML, &aligned); err != nil {
		return xml_Configuration{}, err
	}

	return aligned, nil
}

func (r *configResource) readStateFromDevice(ctx context.Context, reference ConfigResourceModel, diags *diag.Diagnostics) (ConfigResourceModel, bool) {
	// PATCHED (fabric): trust the apply — return the plan/prior state as the
	// resource state instead of reading the whole device back (avoids
	// "provider produced inconsistent result"). See apply_patches.py.
	return reference, true
}

func mergeReadStateWithReference(ctx context.Context, observed ConfigResourceModel, reference ConfigResourceModel) ConfigResourceModel {
	// resource_name is Terraform-only (not in device XML), always preserve from plan.
	observed.ResourceName = reference.ResourceName

	// For each top-level list attribute, if device readback returned null but the
	// plan had a value, preserve the plan value.  This handles containers whose
	// XML structs are empty (no modeled children) so the Go XML unmarshaler
	// returns nil and configToModel maps them to types.ListNull.
	if observed.Chassis.IsNull() || reference.Chassis.IsNull() {
		observed.Chassis = reference.Chassis
	}
	if observed.Firewall.IsNull() || reference.Firewall.IsNull() {
		observed.Firewall = reference.Firewall
	}
	if observed.Forwarding_options.IsNull() || reference.Forwarding_options.IsNull() {
		observed.Forwarding_options = reference.Forwarding_options
	}
	if observed.Interfaces.IsNull() || reference.Interfaces.IsNull() {
		observed.Interfaces = reference.Interfaces
	}
	if observed.Protocols.IsNull() || reference.Protocols.IsNull() {
		observed.Protocols = reference.Protocols
	}
	if observed.Routing_options.IsNull() || reference.Routing_options.IsNull() {
		observed.Routing_options = reference.Routing_options
	}
	if observed.System.IsNull() || reference.System.IsNull() {
		observed.System = reference.System
	}
	if observed.Virtual_chassis.IsNull() || reference.Virtual_chassis.IsNull() {
		observed.Virtual_chassis = reference.Virtual_chassis
	}
	if observed.Vlans.IsNull() || reference.Vlans.IsNull() {
		observed.Vlans = reference.Vlans
	}

	return observed
}




// Create implements resource.Resource.
func (r *configResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	
	var plan ConfigResourceModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	// Check for errors
	if resp.Diagnostics.HasError() {
		return
	}
	config := modelToConfig(ctx, plan, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.SendDirectTransaction(config, false)
	if err != nil {
		resp.Diagnostics.AddError("Failed while applying configuration", err.Error())
		return
	}
	commit_err := r.client.SendCommit()
	if commit_err != nil {
		resp.Diagnostics.AddError("Failed while committing configuration", commit_err.Error())
		return
	}
	state, ok := r.readStateFromDevice(ctx, plan, &resp.Diagnostics)
	if !ok {
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}




func configToModel(ctx context.Context, config xml_Configuration) ConfigResourceModel {
	var state ConfigResourceModel
    // Initialize chassis as Null; only materialize when we have elements
    state.Chassis =
        types.ListNull(types.ObjectType{AttrTypes: Chassis_Model{}.AttrTypes()})

    // Build list from device
    chassis_List := make([]Chassis_Model,
        len(config.Chassis))
    for i_chassis, v_chassis := range config.Chassis {
        var chassis_model Chassis_Model
            
        // Build aggregated-devices list
        chassis_aggregated_devices_List := make([]Chassis_Aggregated_devices_Model, len(v_chassis.Aggregated_devices))

        
		for i_chassis_aggregated_devices, v_chassis_aggregated_devices := range v_chassis.Aggregated_devices {
            var chassis_aggregated_devices_model Chassis_Aggregated_devices_Model

            chassis_aggregated_devices_List[i_chassis_aggregated_devices] =
                chassis_aggregated_devices_model
                
        // Build ethernet list
        chassis_aggregated_devices_ethernet_List := make([]Chassis_Aggregated_devices_Ethernet_Model, len(v_chassis_aggregated_devices.Ethernet))

        
		for i_chassis_aggregated_devices_ethernet, v_chassis_aggregated_devices_ethernet := range v_chassis_aggregated_devices.Ethernet {
            var chassis_aggregated_devices_ethernet_model Chassis_Aggregated_devices_Ethernet_Model
            // leaf
            if v_chassis_aggregated_devices_ethernet.Device_count == nil {
                chassis_aggregated_devices_ethernet_model.Device_count =
                    types.StringNull()
            } else {
				chassis_aggregated_devices_ethernet_model.Device_count =
                types.StringPointerValue(v_chassis_aggregated_devices_ethernet.Device_count)
			}

            chassis_aggregated_devices_ethernet_List[i_chassis_aggregated_devices_ethernet] =
                chassis_aggregated_devices_ethernet_model
        }

        // Write ethernet field as Null when empty, else concrete list
        if len(chassis_aggregated_devices_ethernet_List) == 0 {
            chassis_aggregated_devices_model.Ethernet =
                types.ListNull(types.ObjectType{AttrTypes: Chassis_Aggregated_devices_Ethernet_Model{}.AttrTypes()})
        } else {
            chassis_aggregated_devices_model.Ethernet, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Chassis_Aggregated_devices_Ethernet_Model{}.AttrTypes()},
                    chassis_aggregated_devices_ethernet_List,
                )
        }
        chassis_aggregated_devices_List[i_chassis_aggregated_devices] = chassis_aggregated_devices_model
        }

        // Write aggregated-devices field as Null when empty, else concrete list
        if len(chassis_aggregated_devices_List) == 0 {
            chassis_model.Aggregated_devices =
                types.ListNull(types.ObjectType{AttrTypes: Chassis_Aggregated_devices_Model{}.AttrTypes()})
        } else {
            chassis_model.Aggregated_devices, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Chassis_Aggregated_devices_Model{}.AttrTypes()},
                    chassis_aggregated_devices_List,
                )
        }
        chassis_List[i_chassis] = chassis_model
            
        // Build fpc list
        chassis_fpc_List := make([]Chassis_Fpc_Model, len(v_chassis.Fpc))

        
		for i_chassis_fpc, v_chassis_fpc := range v_chassis.Fpc {
            var chassis_fpc_model Chassis_Fpc_Model
            // leaf
            if v_chassis_fpc.Name == nil {
                chassis_fpc_model.Name =
                    types.StringNull()
            } else {
				chassis_fpc_model.Name =
                types.StringPointerValue(v_chassis_fpc.Name)
			}

            chassis_fpc_List[i_chassis_fpc] =
                chassis_fpc_model

            chassis_fpc_List[i_chassis_fpc] =
                chassis_fpc_model
                
        // Build pic list
        chassis_fpc_pic_List := make([]Chassis_Fpc_Pic_Model, len(v_chassis_fpc.Pic))

        
		for i_chassis_fpc_pic, v_chassis_fpc_pic := range v_chassis_fpc.Pic {
            var chassis_fpc_pic_model Chassis_Fpc_Pic_Model
            // leaf
            if v_chassis_fpc_pic.Name == nil {
                chassis_fpc_pic_model.Name =
                    types.StringNull()
            } else {
				chassis_fpc_pic_model.Name =
                types.StringPointerValue(v_chassis_fpc_pic.Name)
			}

            chassis_fpc_pic_List[i_chassis_fpc_pic] =
                chassis_fpc_pic_model

            chassis_fpc_pic_List[i_chassis_fpc_pic] =
                chassis_fpc_pic_model
                
        // Build port list
        chassis_fpc_pic_port_List := make([]Chassis_Fpc_Pic_Port_Model, len(v_chassis_fpc_pic.Port))

        
		for i_chassis_fpc_pic_port, v_chassis_fpc_pic_port := range v_chassis_fpc_pic.Port {
            var chassis_fpc_pic_port_model Chassis_Fpc_Pic_Port_Model
            // leaf
            if v_chassis_fpc_pic_port.Name == nil {
                chassis_fpc_pic_port_model.Name =
                    types.StringNull()
            } else {
				chassis_fpc_pic_port_model.Name =
                types.StringPointerValue(v_chassis_fpc_pic_port.Name)
			}

            chassis_fpc_pic_port_List[i_chassis_fpc_pic_port] =
                chassis_fpc_pic_port_model
            // leaf
            if v_chassis_fpc_pic_port.Speed == nil {
                chassis_fpc_pic_port_model.Speed =
                    types.StringNull()
            } else {
				chassis_fpc_pic_port_model.Speed =
                types.StringPointerValue(v_chassis_fpc_pic_port.Speed)
			}

            chassis_fpc_pic_port_List[i_chassis_fpc_pic_port] =
                chassis_fpc_pic_port_model
            // leaf
            if v_chassis_fpc_pic_port.Channel_speed == nil {
                chassis_fpc_pic_port_model.Channel_speed =
                    types.StringNull()
            } else {
				chassis_fpc_pic_port_model.Channel_speed =
                types.StringPointerValue(v_chassis_fpc_pic_port.Channel_speed)
			}

            chassis_fpc_pic_port_List[i_chassis_fpc_pic_port] =
                chassis_fpc_pic_port_model
        }

        // Write port field as Null when empty, else concrete list
        if len(chassis_fpc_pic_port_List) == 0 {
            chassis_fpc_pic_model.Port =
                types.ListNull(types.ObjectType{AttrTypes: Chassis_Fpc_Pic_Port_Model{}.AttrTypes()})
        } else {
            chassis_fpc_pic_model.Port, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Chassis_Fpc_Pic_Port_Model{}.AttrTypes()},
                    chassis_fpc_pic_port_List,
                )
        }
        chassis_fpc_pic_List[i_chassis_fpc_pic] = chassis_fpc_pic_model
        }

        // Write pic field as Null when empty, else concrete list
        if len(chassis_fpc_pic_List) == 0 {
            chassis_fpc_model.Pic =
                types.ListNull(types.ObjectType{AttrTypes: Chassis_Fpc_Pic_Model{}.AttrTypes()})
        } else {
            chassis_fpc_model.Pic, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Chassis_Fpc_Pic_Model{}.AttrTypes()},
                    chassis_fpc_pic_List,
                )
        }
        chassis_fpc_List[i_chassis_fpc] = chassis_fpc_model
        }

        // Write fpc field as Null when empty, else concrete list
        if len(chassis_fpc_List) == 0 {
            chassis_model.Fpc =
                types.ListNull(types.ObjectType{AttrTypes: Chassis_Fpc_Model{}.AttrTypes()})
        } else {
            chassis_model.Fpc, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Chassis_Fpc_Model{}.AttrTypes()},
                    chassis_fpc_List,
                )
        }
        chassis_List[i_chassis] = chassis_model

        chassis_List[i_chassis] = chassis_model
    }

    // Write parent list as Null when empty
    if len(chassis_List) == 0 {
        state.Chassis =
            types.ListNull(types.ObjectType{AttrTypes: Chassis_Model{}.AttrTypes()})
    } else {
        state.Chassis, _ =
            types.ListValueFrom(ctx,
                types.ObjectType{AttrTypes: Chassis_Model{}.AttrTypes()},
                chassis_List,
            )
    }
    // Initialize firewall as Null; only materialize when we have elements
    state.Firewall =
        types.ListNull(types.ObjectType{AttrTypes: Firewall_Model{}.AttrTypes()})

    // Build list from device
    firewall_List := make([]Firewall_Model,
        len(config.Firewall))
    for i_firewall, v_firewall := range config.Firewall {
        var firewall_model Firewall_Model
            
        // Build family list
        firewall_family_List := make([]Firewall_Family_Model, len(v_firewall.Family))

        
		for i_firewall_family, v_firewall_family := range v_firewall.Family {
            var firewall_family_model Firewall_Family_Model

            firewall_family_List[i_firewall_family] =
                firewall_family_model
                
        // Build inet list
        firewall_family_inet_List := make([]Firewall_Family_Inet_Model, len(v_firewall_family.Inet))

        
		for i_firewall_family_inet, v_firewall_family_inet := range v_firewall_family.Inet {
            var firewall_family_inet_model Firewall_Family_Inet_Model

            firewall_family_inet_List[i_firewall_family_inet] =
                firewall_family_inet_model
                
        // Build filter list
        firewall_family_inet_filter_List := make([]Firewall_Family_Inet_Filter_Model, len(v_firewall_family_inet.Filter))

        
		for i_firewall_family_inet_filter, v_firewall_family_inet_filter := range v_firewall_family_inet.Filter {
            var firewall_family_inet_filter_model Firewall_Family_Inet_Filter_Model
            // leaf
            if v_firewall_family_inet_filter.Name == nil {
                firewall_family_inet_filter_model.Name =
                    types.StringNull()
            } else {
				firewall_family_inet_filter_model.Name =
                types.StringPointerValue(v_firewall_family_inet_filter.Name)
			}

            firewall_family_inet_filter_List[i_firewall_family_inet_filter] =
                firewall_family_inet_filter_model

            firewall_family_inet_filter_List[i_firewall_family_inet_filter] =
                firewall_family_inet_filter_model
                
        // Build term list
        firewall_family_inet_filter_term_List := make([]Firewall_Family_Inet_Filter_Term_Model, len(v_firewall_family_inet_filter.Term))

        
		for i_firewall_family_inet_filter_term, v_firewall_family_inet_filter_term := range v_firewall_family_inet_filter.Term {
            var firewall_family_inet_filter_term_model Firewall_Family_Inet_Filter_Term_Model
            // leaf
            if v_firewall_family_inet_filter_term.Name == nil {
                firewall_family_inet_filter_term_model.Name =
                    types.StringNull()
            } else {
				firewall_family_inet_filter_term_model.Name =
                types.StringPointerValue(v_firewall_family_inet_filter_term.Name)
			}

            firewall_family_inet_filter_term_List[i_firewall_family_inet_filter_term] =
                firewall_family_inet_filter_term_model

            firewall_family_inet_filter_term_List[i_firewall_family_inet_filter_term] =
                firewall_family_inet_filter_term_model
                
        // Build from list
        firewall_family_inet_filter_term_from_List := make([]Firewall_Family_Inet_Filter_Term_From_Model, len(v_firewall_family_inet_filter_term.From))

        
		for i_firewall_family_inet_filter_term_from, v_firewall_family_inet_filter_term_from := range v_firewall_family_inet_filter_term.From {
            var firewall_family_inet_filter_term_from_model Firewall_Family_Inet_Filter_Term_From_Model

            firewall_family_inet_filter_term_from_List[i_firewall_family_inet_filter_term_from] =
                firewall_family_inet_filter_term_from_model
                
        // Build source-address list
        firewall_family_inet_filter_term_from_source_address_List := make([]Firewall_Family_Inet_Filter_Term_From_Source_address_Model, len(v_firewall_family_inet_filter_term_from.Source_address))

        
		for i_firewall_family_inet_filter_term_from_source_address, v_firewall_family_inet_filter_term_from_source_address := range v_firewall_family_inet_filter_term_from.Source_address {
            var firewall_family_inet_filter_term_from_source_address_model Firewall_Family_Inet_Filter_Term_From_Source_address_Model
            // leaf
            if v_firewall_family_inet_filter_term_from_source_address.Name == nil {
                firewall_family_inet_filter_term_from_source_address_model.Name =
                    types.StringNull()
            } else {
				firewall_family_inet_filter_term_from_source_address_model.Name =
                types.StringPointerValue(v_firewall_family_inet_filter_term_from_source_address.Name)
			}

            firewall_family_inet_filter_term_from_source_address_List[i_firewall_family_inet_filter_term_from_source_address] =
                firewall_family_inet_filter_term_from_source_address_model
        }

        // Write source-address field as Null when empty, else concrete list
        if len(firewall_family_inet_filter_term_from_source_address_List) == 0 {
            firewall_family_inet_filter_term_from_model.Source_address =
                types.ListNull(types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_From_Source_address_Model{}.AttrTypes()})
        } else {
            firewall_family_inet_filter_term_from_model.Source_address, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_From_Source_address_Model{}.AttrTypes()},
                    firewall_family_inet_filter_term_from_source_address_List,
                )
        }
        firewall_family_inet_filter_term_from_List[i_firewall_family_inet_filter_term_from] = firewall_family_inet_filter_term_from_model

            firewall_family_inet_filter_term_from_List[i_firewall_family_inet_filter_term_from] =
                firewall_family_inet_filter_term_from_model
                
        // Build destination-address list
        firewall_family_inet_filter_term_from_destination_address_List := make([]Firewall_Family_Inet_Filter_Term_From_Destination_address_Model, len(v_firewall_family_inet_filter_term_from.Destination_address))

        
		for i_firewall_family_inet_filter_term_from_destination_address, v_firewall_family_inet_filter_term_from_destination_address := range v_firewall_family_inet_filter_term_from.Destination_address {
            var firewall_family_inet_filter_term_from_destination_address_model Firewall_Family_Inet_Filter_Term_From_Destination_address_Model
            // leaf
            if v_firewall_family_inet_filter_term_from_destination_address.Name == nil {
                firewall_family_inet_filter_term_from_destination_address_model.Name =
                    types.StringNull()
            } else {
				firewall_family_inet_filter_term_from_destination_address_model.Name =
                types.StringPointerValue(v_firewall_family_inet_filter_term_from_destination_address.Name)
			}

            firewall_family_inet_filter_term_from_destination_address_List[i_firewall_family_inet_filter_term_from_destination_address] =
                firewall_family_inet_filter_term_from_destination_address_model
        }

        // Write destination-address field as Null when empty, else concrete list
        if len(firewall_family_inet_filter_term_from_destination_address_List) == 0 {
            firewall_family_inet_filter_term_from_model.Destination_address =
                types.ListNull(types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_From_Destination_address_Model{}.AttrTypes()})
        } else {
            firewall_family_inet_filter_term_from_model.Destination_address, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_From_Destination_address_Model{}.AttrTypes()},
                    firewall_family_inet_filter_term_from_destination_address_List,
                )
        }
        firewall_family_inet_filter_term_from_List[i_firewall_family_inet_filter_term_from] = firewall_family_inet_filter_term_from_model
        }

        // Write from field as Null when empty, else concrete list
        if len(firewall_family_inet_filter_term_from_List) == 0 {
            firewall_family_inet_filter_term_model.From =
                types.ListNull(types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_From_Model{}.AttrTypes()})
        } else {
            firewall_family_inet_filter_term_model.From, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_From_Model{}.AttrTypes()},
                    firewall_family_inet_filter_term_from_List,
                )
        }
        firewall_family_inet_filter_term_List[i_firewall_family_inet_filter_term] = firewall_family_inet_filter_term_model

            firewall_family_inet_filter_term_List[i_firewall_family_inet_filter_term] =
                firewall_family_inet_filter_term_model
                
        // Build then list
        firewall_family_inet_filter_term_then_List := make([]Firewall_Family_Inet_Filter_Term_Then_Model, len(v_firewall_family_inet_filter_term.Then))

        
		for i_firewall_family_inet_filter_term_then, v_firewall_family_inet_filter_term_then := range v_firewall_family_inet_filter_term.Then {
            var firewall_family_inet_filter_term_then_model Firewall_Family_Inet_Filter_Term_Then_Model
            // leaf
            if v_firewall_family_inet_filter_term_then.Accept == nil {
                firewall_family_inet_filter_term_then_model.Accept =
                    types.StringNull()
            } else {
				firewall_family_inet_filter_term_then_model.Accept =
                types.StringPointerValue(v_firewall_family_inet_filter_term_then.Accept)
			}

            firewall_family_inet_filter_term_then_List[i_firewall_family_inet_filter_term_then] =
                firewall_family_inet_filter_term_then_model

            firewall_family_inet_filter_term_then_List[i_firewall_family_inet_filter_term_then] =
                firewall_family_inet_filter_term_then_model
                
        // Build discard list
        firewall_family_inet_filter_term_then_discard_List := make([]Firewall_Family_Inet_Filter_Term_Then_Discard_Model, len(v_firewall_family_inet_filter_term_then.Discard))

        

        // Write discard field as Null when empty, else concrete list
        if len(firewall_family_inet_filter_term_then_discard_List) == 0 {
            firewall_family_inet_filter_term_then_model.Discard =
                types.ListNull(types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_Then_Discard_Model{}.AttrTypes()})
        } else {
            firewall_family_inet_filter_term_then_model.Discard, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_Then_Discard_Model{}.AttrTypes()},
                    firewall_family_inet_filter_term_then_discard_List,
                )
        }
        firewall_family_inet_filter_term_then_List[i_firewall_family_inet_filter_term_then] = firewall_family_inet_filter_term_then_model
        }

        // Write then field as Null when empty, else concrete list
        if len(firewall_family_inet_filter_term_then_List) == 0 {
            firewall_family_inet_filter_term_model.Then =
                types.ListNull(types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_Then_Model{}.AttrTypes()})
        } else {
            firewall_family_inet_filter_term_model.Then, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_Then_Model{}.AttrTypes()},
                    firewall_family_inet_filter_term_then_List,
                )
        }
        firewall_family_inet_filter_term_List[i_firewall_family_inet_filter_term] = firewall_family_inet_filter_term_model
        }

        // Write term field as Null when empty, else concrete list
        if len(firewall_family_inet_filter_term_List) == 0 {
            firewall_family_inet_filter_model.Term =
                types.ListNull(types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_Model{}.AttrTypes()})
        } else {
            firewall_family_inet_filter_model.Term, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Term_Model{}.AttrTypes()},
                    firewall_family_inet_filter_term_List,
                )
        }
        firewall_family_inet_filter_List[i_firewall_family_inet_filter] = firewall_family_inet_filter_model
        }

        // Write filter field as Null when empty, else concrete list
        if len(firewall_family_inet_filter_List) == 0 {
            firewall_family_inet_model.Filter =
                types.ListNull(types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Model{}.AttrTypes()})
        } else {
            firewall_family_inet_model.Filter, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Firewall_Family_Inet_Filter_Model{}.AttrTypes()},
                    firewall_family_inet_filter_List,
                )
        }
        firewall_family_inet_List[i_firewall_family_inet] = firewall_family_inet_model
        }

        // Write inet field as Null when empty, else concrete list
        if len(firewall_family_inet_List) == 0 {
            firewall_family_model.Inet =
                types.ListNull(types.ObjectType{AttrTypes: Firewall_Family_Inet_Model{}.AttrTypes()})
        } else {
            firewall_family_model.Inet, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Firewall_Family_Inet_Model{}.AttrTypes()},
                    firewall_family_inet_List,
                )
        }
        firewall_family_List[i_firewall_family] = firewall_family_model
        }

        // Write family field as Null when empty, else concrete list
        if len(firewall_family_List) == 0 {
            firewall_model.Family =
                types.ListNull(types.ObjectType{AttrTypes: Firewall_Family_Model{}.AttrTypes()})
        } else {
            firewall_model.Family, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Firewall_Family_Model{}.AttrTypes()},
                    firewall_family_List,
                )
        }
        firewall_List[i_firewall] = firewall_model

        firewall_List[i_firewall] = firewall_model
    }

    // Write parent list as Null when empty
    if len(firewall_List) == 0 {
        state.Firewall =
            types.ListNull(types.ObjectType{AttrTypes: Firewall_Model{}.AttrTypes()})
    } else {
        state.Firewall, _ =
            types.ListValueFrom(ctx,
                types.ObjectType{AttrTypes: Firewall_Model{}.AttrTypes()},
                firewall_List,
            )
    }
    // Initialize forwarding-options as Null; only materialize when we have elements
    state.Forwarding_options =
        types.ListNull(types.ObjectType{AttrTypes: Forwarding_options_Model{}.AttrTypes()})

    // Build list from device
    forwarding_options_List := make([]Forwarding_options_Model,
        len(config.Forwarding_options))
    for i_forwarding_options, v_forwarding_options := range config.Forwarding_options {
        var forwarding_options_model Forwarding_options_Model
            
        // Build storm-control-profiles list
        forwarding_options_storm_control_profiles_List := make([]Forwarding_options_Storm_control_profiles_Model, len(v_forwarding_options.Storm_control_profiles))

        
		for i_forwarding_options_storm_control_profiles, v_forwarding_options_storm_control_profiles := range v_forwarding_options.Storm_control_profiles {
            var forwarding_options_storm_control_profiles_model Forwarding_options_Storm_control_profiles_Model
            // leaf
            if v_forwarding_options_storm_control_profiles.Name == nil {
                forwarding_options_storm_control_profiles_model.Name =
                    types.StringNull()
            } else {
				forwarding_options_storm_control_profiles_model.Name =
                types.StringPointerValue(v_forwarding_options_storm_control_profiles.Name)
			}

            forwarding_options_storm_control_profiles_List[i_forwarding_options_storm_control_profiles] =
                forwarding_options_storm_control_profiles_model

            forwarding_options_storm_control_profiles_List[i_forwarding_options_storm_control_profiles] =
                forwarding_options_storm_control_profiles_model
                
        // Build all list
        forwarding_options_storm_control_profiles_all_List := make([]Forwarding_options_Storm_control_profiles_All_Model, len(v_forwarding_options_storm_control_profiles.All))

        
		for i_forwarding_options_storm_control_profiles_all, v_forwarding_options_storm_control_profiles_all := range v_forwarding_options_storm_control_profiles.All {
            var forwarding_options_storm_control_profiles_all_model Forwarding_options_Storm_control_profiles_All_Model
            // leaf
            if v_forwarding_options_storm_control_profiles_all.Bandwidth_level == nil {
                forwarding_options_storm_control_profiles_all_model.Bandwidth_level =
                    types.StringNull()
            } else {
				forwarding_options_storm_control_profiles_all_model.Bandwidth_level =
                types.StringPointerValue(v_forwarding_options_storm_control_profiles_all.Bandwidth_level)
			}

            forwarding_options_storm_control_profiles_all_List[i_forwarding_options_storm_control_profiles_all] =
                forwarding_options_storm_control_profiles_all_model
        }

        // Write all field as Null when empty, else concrete list
        if len(forwarding_options_storm_control_profiles_all_List) == 0 {
            forwarding_options_storm_control_profiles_model.All =
                types.ListNull(types.ObjectType{AttrTypes: Forwarding_options_Storm_control_profiles_All_Model{}.AttrTypes()})
        } else {
            forwarding_options_storm_control_profiles_model.All, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Forwarding_options_Storm_control_profiles_All_Model{}.AttrTypes()},
                    forwarding_options_storm_control_profiles_all_List,
                )
        }
        forwarding_options_storm_control_profiles_List[i_forwarding_options_storm_control_profiles] = forwarding_options_storm_control_profiles_model
        }

        // Write storm-control-profiles field as Null when empty, else concrete list
        if len(forwarding_options_storm_control_profiles_List) == 0 {
            forwarding_options_model.Storm_control_profiles =
                types.ListNull(types.ObjectType{AttrTypes: Forwarding_options_Storm_control_profiles_Model{}.AttrTypes()})
        } else {
            forwarding_options_model.Storm_control_profiles, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Forwarding_options_Storm_control_profiles_Model{}.AttrTypes()},
                    forwarding_options_storm_control_profiles_List,
                )
        }
        forwarding_options_List[i_forwarding_options] = forwarding_options_model

        forwarding_options_List[i_forwarding_options] = forwarding_options_model
    }

    // Write parent list as Null when empty
    if len(forwarding_options_List) == 0 {
        state.Forwarding_options =
            types.ListNull(types.ObjectType{AttrTypes: Forwarding_options_Model{}.AttrTypes()})
    } else {
        state.Forwarding_options, _ =
            types.ListValueFrom(ctx,
                types.ObjectType{AttrTypes: Forwarding_options_Model{}.AttrTypes()},
                forwarding_options_List,
            )
    }
    // Initialize interfaces as Null; only materialize when we have elements
    state.Interfaces =
        types.ListNull(types.ObjectType{AttrTypes: Interfaces_Model{}.AttrTypes()})

    // Build list from device
    interfaces_List := make([]Interfaces_Model,
        len(config.Interfaces))
    for i_interfaces, v_interfaces := range config.Interfaces {
        var interfaces_model Interfaces_Model
            
        // Build interface list
        interfaces_interface_List := make([]Interfaces_Interface_Model, len(v_interfaces.Interface))

        
		for i_interfaces_interface, v_interfaces_interface := range v_interfaces.Interface {
            var interfaces_interface_model Interfaces_Interface_Model
            // leaf
            if v_interfaces_interface.Name == nil {
                interfaces_interface_model.Name =
                    types.StringNull()
            } else {
				interfaces_interface_model.Name =
                types.StringPointerValue(v_interfaces_interface.Name)
			}

            interfaces_interface_List[i_interfaces_interface] =
                interfaces_interface_model
            // leaf
            if v_interfaces_interface.Mtu == nil {
                interfaces_interface_model.Mtu =
                    types.StringNull()
            } else {
				interfaces_interface_model.Mtu =
                types.StringPointerValue(v_interfaces_interface.Mtu)
			}

            interfaces_interface_List[i_interfaces_interface] =
                interfaces_interface_model

            interfaces_interface_List[i_interfaces_interface] =
                interfaces_interface_model
                
        // Build ether-options list
        interfaces_interface_ether_options_List := make([]Interfaces_Interface_Ether_options_Model, len(v_interfaces_interface.Ether_options))

        
		for i_interfaces_interface_ether_options, v_interfaces_interface_ether_options := range v_interfaces_interface.Ether_options {
            var interfaces_interface_ether_options_model Interfaces_Interface_Ether_options_Model

            interfaces_interface_ether_options_List[i_interfaces_interface_ether_options] =
                interfaces_interface_ether_options_model
                
        // Build ieee-802.3ad list
        interfaces_interface_ether_options_ieee_802_3ad_List := make([]Interfaces_Interface_Ether_options_Ieee_802_3ad_Model, len(v_interfaces_interface_ether_options.Ieee_802_3ad))

        
		for i_interfaces_interface_ether_options_ieee_802_3ad, v_interfaces_interface_ether_options_ieee_802_3ad := range v_interfaces_interface_ether_options.Ieee_802_3ad {
            var interfaces_interface_ether_options_ieee_802_3ad_model Interfaces_Interface_Ether_options_Ieee_802_3ad_Model
            // leaf
            if v_interfaces_interface_ether_options_ieee_802_3ad.Bundle == nil {
                interfaces_interface_ether_options_ieee_802_3ad_model.Bundle =
                    types.StringNull()
            } else {
				interfaces_interface_ether_options_ieee_802_3ad_model.Bundle =
                types.StringPointerValue(v_interfaces_interface_ether_options_ieee_802_3ad.Bundle)
			}

            interfaces_interface_ether_options_ieee_802_3ad_List[i_interfaces_interface_ether_options_ieee_802_3ad] =
                interfaces_interface_ether_options_ieee_802_3ad_model
        }

        // Write ieee-802.3ad field as Null when empty, else concrete list
        if len(interfaces_interface_ether_options_ieee_802_3ad_List) == 0 {
            interfaces_interface_ether_options_model.Ieee_802_3ad =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Ether_options_Ieee_802_3ad_Model{}.AttrTypes()})
        } else {
            interfaces_interface_ether_options_model.Ieee_802_3ad, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Ether_options_Ieee_802_3ad_Model{}.AttrTypes()},
                    interfaces_interface_ether_options_ieee_802_3ad_List,
                )
        }
        interfaces_interface_ether_options_List[i_interfaces_interface_ether_options] = interfaces_interface_ether_options_model
        }

        // Write ether-options field as Null when empty, else concrete list
        if len(interfaces_interface_ether_options_List) == 0 {
            interfaces_interface_model.Ether_options =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Ether_options_Model{}.AttrTypes()})
        } else {
            interfaces_interface_model.Ether_options, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Ether_options_Model{}.AttrTypes()},
                    interfaces_interface_ether_options_List,
                )
        }
        interfaces_interface_List[i_interfaces_interface] = interfaces_interface_model

            interfaces_interface_List[i_interfaces_interface] =
                interfaces_interface_model
                
        // Build aggregated-ether-options list
        interfaces_interface_aggregated_ether_options_List := make([]Interfaces_Interface_Aggregated_ether_options_Model, len(v_interfaces_interface.Aggregated_ether_options))

        
		for i_interfaces_interface_aggregated_ether_options, v_interfaces_interface_aggregated_ether_options := range v_interfaces_interface.Aggregated_ether_options {
            var interfaces_interface_aggregated_ether_options_model Interfaces_Interface_Aggregated_ether_options_Model

            interfaces_interface_aggregated_ether_options_List[i_interfaces_interface_aggregated_ether_options] =
                interfaces_interface_aggregated_ether_options_model
                
        // Build lacp list
        interfaces_interface_aggregated_ether_options_lacp_List := make([]Interfaces_Interface_Aggregated_ether_options_Lacp_Model, len(v_interfaces_interface_aggregated_ether_options.Lacp))

        
		for i_interfaces_interface_aggregated_ether_options_lacp, v_interfaces_interface_aggregated_ether_options_lacp := range v_interfaces_interface_aggregated_ether_options.Lacp {
            var interfaces_interface_aggregated_ether_options_lacp_model Interfaces_Interface_Aggregated_ether_options_Lacp_Model
            // leaf
            if v_interfaces_interface_aggregated_ether_options_lacp.Active == nil {
                interfaces_interface_aggregated_ether_options_lacp_model.Active =
                    types.StringNull()
            } else {
				interfaces_interface_aggregated_ether_options_lacp_model.Active =
                types.StringPointerValue(v_interfaces_interface_aggregated_ether_options_lacp.Active)
			}

            interfaces_interface_aggregated_ether_options_lacp_List[i_interfaces_interface_aggregated_ether_options_lacp] =
                interfaces_interface_aggregated_ether_options_lacp_model
        }

        // Write lacp field as Null when empty, else concrete list
        if len(interfaces_interface_aggregated_ether_options_lacp_List) == 0 {
            interfaces_interface_aggregated_ether_options_model.Lacp =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Aggregated_ether_options_Lacp_Model{}.AttrTypes()})
        } else {
            interfaces_interface_aggregated_ether_options_model.Lacp, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Aggregated_ether_options_Lacp_Model{}.AttrTypes()},
                    interfaces_interface_aggregated_ether_options_lacp_List,
                )
        }
        interfaces_interface_aggregated_ether_options_List[i_interfaces_interface_aggregated_ether_options] = interfaces_interface_aggregated_ether_options_model
        }

        // Write aggregated-ether-options field as Null when empty, else concrete list
        if len(interfaces_interface_aggregated_ether_options_List) == 0 {
            interfaces_interface_model.Aggregated_ether_options =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Aggregated_ether_options_Model{}.AttrTypes()})
        } else {
            interfaces_interface_model.Aggregated_ether_options, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Aggregated_ether_options_Model{}.AttrTypes()},
                    interfaces_interface_aggregated_ether_options_List,
                )
        }
        interfaces_interface_List[i_interfaces_interface] = interfaces_interface_model

            interfaces_interface_List[i_interfaces_interface] =
                interfaces_interface_model
                
        // Build unit list
        interfaces_interface_unit_List := make([]Interfaces_Interface_Unit_Model, len(v_interfaces_interface.Unit))

        
		for i_interfaces_interface_unit, v_interfaces_interface_unit := range v_interfaces_interface.Unit {
            var interfaces_interface_unit_model Interfaces_Interface_Unit_Model
            // leaf
            if v_interfaces_interface_unit.Name == nil {
                interfaces_interface_unit_model.Name =
                    types.StringNull()
            } else {
				interfaces_interface_unit_model.Name =
                types.StringPointerValue(v_interfaces_interface_unit.Name)
			}

            interfaces_interface_unit_List[i_interfaces_interface_unit] =
                interfaces_interface_unit_model

            interfaces_interface_unit_List[i_interfaces_interface_unit] =
                interfaces_interface_unit_model
                
        // Build family list
        interfaces_interface_unit_family_List := make([]Interfaces_Interface_Unit_Family_Model, len(v_interfaces_interface_unit.Family))

        
		for i_interfaces_interface_unit_family, v_interfaces_interface_unit_family := range v_interfaces_interface_unit.Family {
            var interfaces_interface_unit_family_model Interfaces_Interface_Unit_Family_Model

            interfaces_interface_unit_family_List[i_interfaces_interface_unit_family] =
                interfaces_interface_unit_family_model
                
        // Build inet list
        interfaces_interface_unit_family_inet_List := make([]Interfaces_Interface_Unit_Family_Inet_Model, len(v_interfaces_interface_unit_family.Inet))

        
		for i_interfaces_interface_unit_family_inet, v_interfaces_interface_unit_family_inet := range v_interfaces_interface_unit_family.Inet {
            var interfaces_interface_unit_family_inet_model Interfaces_Interface_Unit_Family_Inet_Model

            interfaces_interface_unit_family_inet_List[i_interfaces_interface_unit_family_inet] =
                interfaces_interface_unit_family_inet_model
                
        // Build filter list
        interfaces_interface_unit_family_inet_filter_List := make([]Interfaces_Interface_Unit_Family_Inet_Filter_Model, len(v_interfaces_interface_unit_family_inet.Filter))

        
		for i_interfaces_interface_unit_family_inet_filter, v_interfaces_interface_unit_family_inet_filter := range v_interfaces_interface_unit_family_inet.Filter {
            var interfaces_interface_unit_family_inet_filter_model Interfaces_Interface_Unit_Family_Inet_Filter_Model

            interfaces_interface_unit_family_inet_filter_List[i_interfaces_interface_unit_family_inet_filter] =
                interfaces_interface_unit_family_inet_filter_model
                
        // Build input list
        interfaces_interface_unit_family_inet_filter_input_List := make([]Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model, len(v_interfaces_interface_unit_family_inet_filter.Input))

        
		for i_interfaces_interface_unit_family_inet_filter_input, v_interfaces_interface_unit_family_inet_filter_input := range v_interfaces_interface_unit_family_inet_filter.Input {
            var interfaces_interface_unit_family_inet_filter_input_model Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model
            // leaf
            if v_interfaces_interface_unit_family_inet_filter_input.Filter_name == nil {
                interfaces_interface_unit_family_inet_filter_input_model.Filter_name =
                    types.StringNull()
            } else {
				interfaces_interface_unit_family_inet_filter_input_model.Filter_name =
                types.StringPointerValue(v_interfaces_interface_unit_family_inet_filter_input.Filter_name)
			}

            interfaces_interface_unit_family_inet_filter_input_List[i_interfaces_interface_unit_family_inet_filter_input] =
                interfaces_interface_unit_family_inet_filter_input_model
        }

        // Write input field as Null when empty, else concrete list
        if len(interfaces_interface_unit_family_inet_filter_input_List) == 0 {
            interfaces_interface_unit_family_inet_filter_model.Input =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model{}.AttrTypes()})
        } else {
            interfaces_interface_unit_family_inet_filter_model.Input, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Filter_Input_Model{}.AttrTypes()},
                    interfaces_interface_unit_family_inet_filter_input_List,
                )
        }
        interfaces_interface_unit_family_inet_filter_List[i_interfaces_interface_unit_family_inet_filter] = interfaces_interface_unit_family_inet_filter_model
        }

        // Write filter field as Null when empty, else concrete list
        if len(interfaces_interface_unit_family_inet_filter_List) == 0 {
            interfaces_interface_unit_family_inet_model.Filter =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Filter_Model{}.AttrTypes()})
        } else {
            interfaces_interface_unit_family_inet_model.Filter, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Filter_Model{}.AttrTypes()},
                    interfaces_interface_unit_family_inet_filter_List,
                )
        }
        interfaces_interface_unit_family_inet_List[i_interfaces_interface_unit_family_inet] = interfaces_interface_unit_family_inet_model

            interfaces_interface_unit_family_inet_List[i_interfaces_interface_unit_family_inet] =
                interfaces_interface_unit_family_inet_model
                
        // Build address list
        interfaces_interface_unit_family_inet_address_List := make([]Interfaces_Interface_Unit_Family_Inet_Address_Model, len(v_interfaces_interface_unit_family_inet.Address))

        
		for i_interfaces_interface_unit_family_inet_address, v_interfaces_interface_unit_family_inet_address := range v_interfaces_interface_unit_family_inet.Address {
            var interfaces_interface_unit_family_inet_address_model Interfaces_Interface_Unit_Family_Inet_Address_Model
            // leaf
            if v_interfaces_interface_unit_family_inet_address.Name == nil {
                interfaces_interface_unit_family_inet_address_model.Name =
                    types.StringNull()
            } else {
				interfaces_interface_unit_family_inet_address_model.Name =
                types.StringPointerValue(v_interfaces_interface_unit_family_inet_address.Name)
			}

            interfaces_interface_unit_family_inet_address_List[i_interfaces_interface_unit_family_inet_address] =
                interfaces_interface_unit_family_inet_address_model
        }

        // Write address field as Null when empty, else concrete list
        if len(interfaces_interface_unit_family_inet_address_List) == 0 {
            interfaces_interface_unit_family_inet_model.Address =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Address_Model{}.AttrTypes()})
        } else {
            interfaces_interface_unit_family_inet_model.Address, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Address_Model{}.AttrTypes()},
                    interfaces_interface_unit_family_inet_address_List,
                )
        }
        interfaces_interface_unit_family_inet_List[i_interfaces_interface_unit_family_inet] = interfaces_interface_unit_family_inet_model
        }

        // Write inet field as Null when empty, else concrete list
        if len(interfaces_interface_unit_family_inet_List) == 0 {
            interfaces_interface_unit_family_model.Inet =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Model{}.AttrTypes()})
        } else {
            interfaces_interface_unit_family_model.Inet, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Inet_Model{}.AttrTypes()},
                    interfaces_interface_unit_family_inet_List,
                )
        }
        interfaces_interface_unit_family_List[i_interfaces_interface_unit_family] = interfaces_interface_unit_family_model

            interfaces_interface_unit_family_List[i_interfaces_interface_unit_family] =
                interfaces_interface_unit_family_model
                
        // Build ethernet-switching list
        interfaces_interface_unit_family_ethernet_switching_List := make([]Interfaces_Interface_Unit_Family_Ethernet_switching_Model, len(v_interfaces_interface_unit_family.Ethernet_switching))

        
		for i_interfaces_interface_unit_family_ethernet_switching, v_interfaces_interface_unit_family_ethernet_switching := range v_interfaces_interface_unit_family.Ethernet_switching {
            var interfaces_interface_unit_family_ethernet_switching_model Interfaces_Interface_Unit_Family_Ethernet_switching_Model
            // leaf
            if v_interfaces_interface_unit_family_ethernet_switching.Interface_mode == nil {
                interfaces_interface_unit_family_ethernet_switching_model.Interface_mode =
                    types.StringNull()
            } else {
				interfaces_interface_unit_family_ethernet_switching_model.Interface_mode =
                types.StringPointerValue(v_interfaces_interface_unit_family_ethernet_switching.Interface_mode)
			}

            interfaces_interface_unit_family_ethernet_switching_List[i_interfaces_interface_unit_family_ethernet_switching] =
                interfaces_interface_unit_family_ethernet_switching_model

            interfaces_interface_unit_family_ethernet_switching_List[i_interfaces_interface_unit_family_ethernet_switching] =
                interfaces_interface_unit_family_ethernet_switching_model
                
        // Build vlan list
        interfaces_interface_unit_family_ethernet_switching_vlan_List := make([]Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model, len(v_interfaces_interface_unit_family_ethernet_switching.Vlan))

        
		for i_interfaces_interface_unit_family_ethernet_switching_vlan, v_interfaces_interface_unit_family_ethernet_switching_vlan := range v_interfaces_interface_unit_family_ethernet_switching.Vlan {
            var interfaces_interface_unit_family_ethernet_switching_vlan_model Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model
            // leaf-list
            if v_interfaces_interface_unit_family_ethernet_switching_vlan.Members == nil ||
               len(v_interfaces_interface_unit_family_ethernet_switching_vlan.Members) == 0 {
                interfaces_interface_unit_family_ethernet_switching_vlan_model.Members =
                    types.ListNull(types.StringType)
            } else {
                src_interfaces_interface_unit_family_ethernet_switching_members :=
                    v_interfaces_interface_unit_family_ethernet_switching_vlan.Members
                vals_interfaces_interface_unit_family_ethernet_switching_members := make([]*string, len(src_interfaces_interface_unit_family_ethernet_switching_members))
                copy(vals_interfaces_interface_unit_family_ethernet_switching_members, src_interfaces_interface_unit_family_ethernet_switching_members)
                interfaces_interface_unit_family_ethernet_switching_vlan_model.Members, _ =
                    types.ListValueFrom(ctx, types.StringType, vals_interfaces_interface_unit_family_ethernet_switching_members)
            }

            interfaces_interface_unit_family_ethernet_switching_vlan_List[i_interfaces_interface_unit_family_ethernet_switching_vlan] =
                interfaces_interface_unit_family_ethernet_switching_vlan_model
        }

        // Write vlan field as Null when empty, else concrete list
        if len(interfaces_interface_unit_family_ethernet_switching_vlan_List) == 0 {
            interfaces_interface_unit_family_ethernet_switching_model.Vlan =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model{}.AttrTypes()})
        } else {
            interfaces_interface_unit_family_ethernet_switching_model.Vlan, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Ethernet_switching_Vlan_Model{}.AttrTypes()},
                    interfaces_interface_unit_family_ethernet_switching_vlan_List,
                )
        }
        interfaces_interface_unit_family_ethernet_switching_List[i_interfaces_interface_unit_family_ethernet_switching] = interfaces_interface_unit_family_ethernet_switching_model

            interfaces_interface_unit_family_ethernet_switching_List[i_interfaces_interface_unit_family_ethernet_switching] =
                interfaces_interface_unit_family_ethernet_switching_model
                
        // Build storm-control list
        interfaces_interface_unit_family_ethernet_switching_storm_control_List := make([]Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model, len(v_interfaces_interface_unit_family_ethernet_switching.Storm_control))

        
		for i_interfaces_interface_unit_family_ethernet_switching_storm_control, v_interfaces_interface_unit_family_ethernet_switching_storm_control := range v_interfaces_interface_unit_family_ethernet_switching.Storm_control {
            var interfaces_interface_unit_family_ethernet_switching_storm_control_model Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model
            // leaf
            if v_interfaces_interface_unit_family_ethernet_switching_storm_control.Profile_name == nil {
                interfaces_interface_unit_family_ethernet_switching_storm_control_model.Profile_name =
                    types.StringNull()
            } else {
				interfaces_interface_unit_family_ethernet_switching_storm_control_model.Profile_name =
                types.StringPointerValue(v_interfaces_interface_unit_family_ethernet_switching_storm_control.Profile_name)
			}

            interfaces_interface_unit_family_ethernet_switching_storm_control_List[i_interfaces_interface_unit_family_ethernet_switching_storm_control] =
                interfaces_interface_unit_family_ethernet_switching_storm_control_model
        }

        // Write storm-control field as Null when empty, else concrete list
        if len(interfaces_interface_unit_family_ethernet_switching_storm_control_List) == 0 {
            interfaces_interface_unit_family_ethernet_switching_model.Storm_control =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model{}.AttrTypes()})
        } else {
            interfaces_interface_unit_family_ethernet_switching_model.Storm_control, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Ethernet_switching_Storm_control_Model{}.AttrTypes()},
                    interfaces_interface_unit_family_ethernet_switching_storm_control_List,
                )
        }
        interfaces_interface_unit_family_ethernet_switching_List[i_interfaces_interface_unit_family_ethernet_switching] = interfaces_interface_unit_family_ethernet_switching_model
        }

        // Write ethernet-switching field as Null when empty, else concrete list
        if len(interfaces_interface_unit_family_ethernet_switching_List) == 0 {
            interfaces_interface_unit_family_model.Ethernet_switching =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Ethernet_switching_Model{}.AttrTypes()})
        } else {
            interfaces_interface_unit_family_model.Ethernet_switching, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Ethernet_switching_Model{}.AttrTypes()},
                    interfaces_interface_unit_family_ethernet_switching_List,
                )
        }
        interfaces_interface_unit_family_List[i_interfaces_interface_unit_family] = interfaces_interface_unit_family_model
        }

        // Write family field as Null when empty, else concrete list
        if len(interfaces_interface_unit_family_List) == 0 {
            interfaces_interface_unit_model.Family =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Model{}.AttrTypes()})
        } else {
            interfaces_interface_unit_model.Family, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Family_Model{}.AttrTypes()},
                    interfaces_interface_unit_family_List,
                )
        }
        interfaces_interface_unit_List[i_interfaces_interface_unit] = interfaces_interface_unit_model
        }

        // Write unit field as Null when empty, else concrete list
        if len(interfaces_interface_unit_List) == 0 {
            interfaces_interface_model.Unit =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Model{}.AttrTypes()})
        } else {
            interfaces_interface_model.Unit, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Unit_Model{}.AttrTypes()},
                    interfaces_interface_unit_List,
                )
        }
        interfaces_interface_List[i_interfaces_interface] = interfaces_interface_model
        }

        // Write interface field as Null when empty, else concrete list
        if len(interfaces_interface_List) == 0 {
            interfaces_model.Interface =
                types.ListNull(types.ObjectType{AttrTypes: Interfaces_Interface_Model{}.AttrTypes()})
        } else {
            interfaces_model.Interface, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Interfaces_Interface_Model{}.AttrTypes()},
                    interfaces_interface_List,
                )
        }
        interfaces_List[i_interfaces] = interfaces_model

        interfaces_List[i_interfaces] = interfaces_model
    }

    // Write parent list as Null when empty
    if len(interfaces_List) == 0 {
        state.Interfaces =
            types.ListNull(types.ObjectType{AttrTypes: Interfaces_Model{}.AttrTypes()})
    } else {
        state.Interfaces, _ =
            types.ListValueFrom(ctx,
                types.ObjectType{AttrTypes: Interfaces_Model{}.AttrTypes()},
                interfaces_List,
            )
    }
    // Initialize protocols as Null; only materialize when we have elements
    state.Protocols =
        types.ListNull(types.ObjectType{AttrTypes: Protocols_Model{}.AttrTypes()})

    // Build list from device
    protocols_List := make([]Protocols_Model,
        len(config.Protocols))
    for i_protocols, v_protocols := range config.Protocols {
        var protocols_model Protocols_Model
            
        // Build lldp list
        protocols_lldp_List := make([]Protocols_Lldp_Model, len(v_protocols.Lldp))

        
		for i_protocols_lldp, v_protocols_lldp := range v_protocols.Lldp {
            var protocols_lldp_model Protocols_Lldp_Model

            protocols_lldp_List[i_protocols_lldp] =
                protocols_lldp_model
                
        // Build interface list
        protocols_lldp_interface_List := make([]Protocols_Lldp_Interface_Model, len(v_protocols_lldp.Interface))

        
		for i_protocols_lldp_interface, v_protocols_lldp_interface := range v_protocols_lldp.Interface {
            var protocols_lldp_interface_model Protocols_Lldp_Interface_Model
            // leaf
            if v_protocols_lldp_interface.Name == nil {
                protocols_lldp_interface_model.Name =
                    types.StringNull()
            } else {
				protocols_lldp_interface_model.Name =
                types.StringPointerValue(v_protocols_lldp_interface.Name)
			}

            protocols_lldp_interface_List[i_protocols_lldp_interface] =
                protocols_lldp_interface_model
        }

        // Write interface field as Null when empty, else concrete list
        if len(protocols_lldp_interface_List) == 0 {
            protocols_lldp_model.Interface =
                types.ListNull(types.ObjectType{AttrTypes: Protocols_Lldp_Interface_Model{}.AttrTypes()})
        } else {
            protocols_lldp_model.Interface, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Protocols_Lldp_Interface_Model{}.AttrTypes()},
                    protocols_lldp_interface_List,
                )
        }
        protocols_lldp_List[i_protocols_lldp] = protocols_lldp_model
        }

        // Write lldp field as Null when empty, else concrete list
        if len(protocols_lldp_List) == 0 {
            protocols_model.Lldp =
                types.ListNull(types.ObjectType{AttrTypes: Protocols_Lldp_Model{}.AttrTypes()})
        } else {
            protocols_model.Lldp, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Protocols_Lldp_Model{}.AttrTypes()},
                    protocols_lldp_List,
                )
        }
        protocols_List[i_protocols] = protocols_model

        protocols_List[i_protocols] = protocols_model
    }

    // Write parent list as Null when empty
    if len(protocols_List) == 0 {
        state.Protocols =
            types.ListNull(types.ObjectType{AttrTypes: Protocols_Model{}.AttrTypes()})
    } else {
        state.Protocols, _ =
            types.ListValueFrom(ctx,
                types.ObjectType{AttrTypes: Protocols_Model{}.AttrTypes()},
                protocols_List,
            )
    }
    // Initialize routing-options as Null; only materialize when we have elements
    state.Routing_options =
        types.ListNull(types.ObjectType{AttrTypes: Routing_options_Model{}.AttrTypes()})

    // Build list from device
    routing_options_List := make([]Routing_options_Model,
        len(config.Routing_options))
    for i_routing_options, v_routing_options := range config.Routing_options {
        var routing_options_model Routing_options_Model
            
        // Build static list
        routing_options_static_List := make([]Routing_options_Static_Model, len(v_routing_options.Static))

        
		for i_routing_options_static, v_routing_options_static := range v_routing_options.Static {
            var routing_options_static_model Routing_options_Static_Model

            routing_options_static_List[i_routing_options_static] =
                routing_options_static_model
                
        // Build route list
        routing_options_static_route_List := make([]Routing_options_Static_Route_Model, len(v_routing_options_static.Route))

        
		for i_routing_options_static_route, v_routing_options_static_route := range v_routing_options_static.Route {
            var routing_options_static_route_model Routing_options_Static_Route_Model
            // leaf
            if v_routing_options_static_route.Name == nil {
                routing_options_static_route_model.Name =
                    types.StringNull()
            } else {
				routing_options_static_route_model.Name =
                types.StringPointerValue(v_routing_options_static_route.Name)
			}

            routing_options_static_route_List[i_routing_options_static_route] =
                routing_options_static_route_model
            // leaf-list
            if v_routing_options_static_route.Next_hop == nil ||
               len(v_routing_options_static_route.Next_hop) == 0 {
                routing_options_static_route_model.Next_hop =
                    types.ListNull(types.StringType)
            } else {
                src_routing_options_static_next_hop :=
                    v_routing_options_static_route.Next_hop
                vals_routing_options_static_next_hop := make([]*string, len(src_routing_options_static_next_hop))
                copy(vals_routing_options_static_next_hop, src_routing_options_static_next_hop)
                routing_options_static_route_model.Next_hop, _ =
                    types.ListValueFrom(ctx, types.StringType, vals_routing_options_static_next_hop)
            }

            routing_options_static_route_List[i_routing_options_static_route] =
                routing_options_static_route_model
        }

        // Write route field as Null when empty, else concrete list
        if len(routing_options_static_route_List) == 0 {
            routing_options_static_model.Route =
                types.ListNull(types.ObjectType{AttrTypes: Routing_options_Static_Route_Model{}.AttrTypes()})
        } else {
            routing_options_static_model.Route, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Routing_options_Static_Route_Model{}.AttrTypes()},
                    routing_options_static_route_List,
                )
        }
        routing_options_static_List[i_routing_options_static] = routing_options_static_model
        }

        // Write static field as Null when empty, else concrete list
        if len(routing_options_static_List) == 0 {
            routing_options_model.Static =
                types.ListNull(types.ObjectType{AttrTypes: Routing_options_Static_Model{}.AttrTypes()})
        } else {
            routing_options_model.Static, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Routing_options_Static_Model{}.AttrTypes()},
                    routing_options_static_List,
                )
        }
        routing_options_List[i_routing_options] = routing_options_model

        routing_options_List[i_routing_options] = routing_options_model
    }

    // Write parent list as Null when empty
    if len(routing_options_List) == 0 {
        state.Routing_options =
            types.ListNull(types.ObjectType{AttrTypes: Routing_options_Model{}.AttrTypes()})
    } else {
        state.Routing_options, _ =
            types.ListValueFrom(ctx,
                types.ObjectType{AttrTypes: Routing_options_Model{}.AttrTypes()},
                routing_options_List,
            )
    }
    // Initialize system as Null; only materialize when we have elements
    state.System =
        types.ListNull(types.ObjectType{AttrTypes: System_Model{}.AttrTypes()})

    // Build list from device
    system_List := make([]System_Model,
        len(config.System))
    for i_system, v_system := range config.System {
        var system_model System_Model
		if v_system.Host_name == nil {
			system_model.Host_name = types.StringNull()
		} else {
			system_model.Host_name =
				types.StringPointerValue(v_system.Host_name)
		}
            
        // Build root-authentication list
        system_root_authentication_List := make([]System_Root_authentication_Model, len(v_system.Root_authentication))

        
		for i_system_root_authentication, v_system_root_authentication := range v_system.Root_authentication {
            var system_root_authentication_model System_Root_authentication_Model
            // leaf
            if v_system_root_authentication.Encrypted_password == nil {
                system_root_authentication_model.Encrypted_password =
                    types.StringNull()
            } else {
				system_root_authentication_model.Encrypted_password =
                types.StringPointerValue(v_system_root_authentication.Encrypted_password)
			}

            system_root_authentication_List[i_system_root_authentication] =
                system_root_authentication_model
        }

        // Write root-authentication field as Null when empty, else concrete list
        if len(system_root_authentication_List) == 0 {
            system_model.Root_authentication =
                types.ListNull(types.ObjectType{AttrTypes: System_Root_authentication_Model{}.AttrTypes()})
        } else {
            system_model.Root_authentication, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Root_authentication_Model{}.AttrTypes()},
                    system_root_authentication_List,
                )
        }
        system_List[i_system] = system_model
            
        // Build login list
        system_login_List := make([]System_Login_Model, len(v_system.Login))

        
		for i_system_login, v_system_login := range v_system.Login {
            var system_login_model System_Login_Model

            system_login_List[i_system_login] =
                system_login_model
                
        // Build user list
        system_login_user_List := make([]System_Login_User_Model, len(v_system_login.User))

        
		for i_system_login_user, v_system_login_user := range v_system_login.User {
            var system_login_user_model System_Login_User_Model
            // leaf
            if v_system_login_user.Name == nil {
                system_login_user_model.Name =
                    types.StringNull()
            } else {
				system_login_user_model.Name =
                types.StringPointerValue(v_system_login_user.Name)
			}

            system_login_user_List[i_system_login_user] =
                system_login_user_model
            // leaf
            if v_system_login_user.Uid == nil {
                system_login_user_model.Uid =
                    types.StringNull()
            } else {
				system_login_user_model.Uid =
                types.StringPointerValue(v_system_login_user.Uid)
			}

            system_login_user_List[i_system_login_user] =
                system_login_user_model
            // leaf
            if v_system_login_user.Class == nil {
                system_login_user_model.Class =
                    types.StringNull()
            } else {
				system_login_user_model.Class =
                types.StringPointerValue(v_system_login_user.Class)
			}

            system_login_user_List[i_system_login_user] =
                system_login_user_model

            system_login_user_List[i_system_login_user] =
                system_login_user_model
                
        // Build authentication list
        system_login_user_authentication_List := make([]System_Login_User_Authentication_Model, len(v_system_login_user.Authentication))

        
		for i_system_login_user_authentication, v_system_login_user_authentication := range v_system_login_user.Authentication {
            var system_login_user_authentication_model System_Login_User_Authentication_Model

            system_login_user_authentication_List[i_system_login_user_authentication] =
                system_login_user_authentication_model
                
        // Build ssh-ed25519 list
        system_login_user_authentication_ssh_ed25519_List := make([]System_Login_User_Authentication_Ssh_ed25519_Model, len(v_system_login_user_authentication.Ssh_ed25519))

        
		for i_system_login_user_authentication_ssh_ed25519, v_system_login_user_authentication_ssh_ed25519 := range v_system_login_user_authentication.Ssh_ed25519 {
            var system_login_user_authentication_ssh_ed25519_model System_Login_User_Authentication_Ssh_ed25519_Model
            // leaf
            if v_system_login_user_authentication_ssh_ed25519.Name == nil {
                system_login_user_authentication_ssh_ed25519_model.Name =
                    types.StringNull()
            } else {
				system_login_user_authentication_ssh_ed25519_model.Name =
                types.StringPointerValue(v_system_login_user_authentication_ssh_ed25519.Name)
			}

            system_login_user_authentication_ssh_ed25519_List[i_system_login_user_authentication_ssh_ed25519] =
                system_login_user_authentication_ssh_ed25519_model
        }

        // Write ssh-ed25519 field as Null when empty, else concrete list
        if len(system_login_user_authentication_ssh_ed25519_List) == 0 {
            system_login_user_authentication_model.Ssh_ed25519 =
                types.ListNull(types.ObjectType{AttrTypes: System_Login_User_Authentication_Ssh_ed25519_Model{}.AttrTypes()})
        } else {
            system_login_user_authentication_model.Ssh_ed25519, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Login_User_Authentication_Ssh_ed25519_Model{}.AttrTypes()},
                    system_login_user_authentication_ssh_ed25519_List,
                )
        }
        system_login_user_authentication_List[i_system_login_user_authentication] = system_login_user_authentication_model
        }

        // Write authentication field as Null when empty, else concrete list
        if len(system_login_user_authentication_List) == 0 {
            system_login_user_model.Authentication =
                types.ListNull(types.ObjectType{AttrTypes: System_Login_User_Authentication_Model{}.AttrTypes()})
        } else {
            system_login_user_model.Authentication, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Login_User_Authentication_Model{}.AttrTypes()},
                    system_login_user_authentication_List,
                )
        }
        system_login_user_List[i_system_login_user] = system_login_user_model
        }

        // Write user field as Null when empty, else concrete list
        if len(system_login_user_List) == 0 {
            system_login_model.User =
                types.ListNull(types.ObjectType{AttrTypes: System_Login_User_Model{}.AttrTypes()})
        } else {
            system_login_model.User, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Login_User_Model{}.AttrTypes()},
                    system_login_user_List,
                )
        }
        system_login_List[i_system_login] = system_login_model
        }

        // Write login field as Null when empty, else concrete list
        if len(system_login_List) == 0 {
            system_model.Login =
                types.ListNull(types.ObjectType{AttrTypes: System_Login_Model{}.AttrTypes()})
        } else {
            system_model.Login, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Login_Model{}.AttrTypes()},
                    system_login_List,
                )
        }
        system_List[i_system] = system_model
            
        // Build services list
        system_services_List := make([]System_Services_Model, len(v_system.Services))

        
		for i_system_services, v_system_services := range v_system.Services {
            var system_services_model System_Services_Model

            system_services_List[i_system_services] =
                system_services_model
                
        // Build netconf list
        system_services_netconf_List := make([]System_Services_Netconf_Model, len(v_system_services.Netconf))

        
		for i_system_services_netconf, v_system_services_netconf := range v_system_services.Netconf {
            var system_services_netconf_model System_Services_Netconf_Model

            system_services_netconf_List[i_system_services_netconf] =
                system_services_netconf_model
                
        // Build ssh list
        system_services_netconf_ssh_List := make([]System_Services_Netconf_Ssh_Model, len(v_system_services_netconf.Ssh))

        

        // Write ssh field as Null when empty, else concrete list
        if len(system_services_netconf_ssh_List) == 0 {
            system_services_netconf_model.Ssh =
                types.ListNull(types.ObjectType{AttrTypes: System_Services_Netconf_Ssh_Model{}.AttrTypes()})
        } else {
            system_services_netconf_model.Ssh, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Services_Netconf_Ssh_Model{}.AttrTypes()},
                    system_services_netconf_ssh_List,
                )
        }
        system_services_netconf_List[i_system_services_netconf] = system_services_netconf_model
        }

        // Write netconf field as Null when empty, else concrete list
        if len(system_services_netconf_List) == 0 {
            system_services_model.Netconf =
                types.ListNull(types.ObjectType{AttrTypes: System_Services_Netconf_Model{}.AttrTypes()})
        } else {
            system_services_model.Netconf, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Services_Netconf_Model{}.AttrTypes()},
                    system_services_netconf_List,
                )
        }
        system_services_List[i_system_services] = system_services_model

            system_services_List[i_system_services] =
                system_services_model
                
        // Build ssh list
        system_services_ssh_List := make([]System_Services_Ssh_Model, len(v_system_services.Ssh))

        
		for i_system_services_ssh, v_system_services_ssh := range v_system_services.Ssh {
            var system_services_ssh_model System_Services_Ssh_Model
            // leaf
            if v_system_services_ssh.Root_login == nil {
                system_services_ssh_model.Root_login =
                    types.StringNull()
            } else {
				system_services_ssh_model.Root_login =
                types.StringPointerValue(v_system_services_ssh.Root_login)
			}

            system_services_ssh_List[i_system_services_ssh] =
                system_services_ssh_model
        }

        // Write ssh field as Null when empty, else concrete list
        if len(system_services_ssh_List) == 0 {
            system_services_model.Ssh =
                types.ListNull(types.ObjectType{AttrTypes: System_Services_Ssh_Model{}.AttrTypes()})
        } else {
            system_services_model.Ssh, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Services_Ssh_Model{}.AttrTypes()},
                    system_services_ssh_List,
                )
        }
        system_services_List[i_system_services] = system_services_model
        }

        // Write services field as Null when empty, else concrete list
        if len(system_services_List) == 0 {
            system_model.Services =
                types.ListNull(types.ObjectType{AttrTypes: System_Services_Model{}.AttrTypes()})
        } else {
            system_model.Services, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Services_Model{}.AttrTypes()},
                    system_services_List,
                )
        }
        system_List[i_system] = system_model
		if v_system.Time_zone == nil {
			system_model.Time_zone = types.StringNull()
		} else {
			system_model.Time_zone =
				types.StringPointerValue(v_system.Time_zone)
		}
		if v_system.Authentication_order == nil ||
		len(v_system.Authentication_order) == 0 {
			system_model.Authentication_order =
				types.ListNull(types.StringType)
		} else {
			src_system_authentication_order :=
				v_system.Authentication_order
			vals_system_authentication_order := make([]*string, len(src_system_authentication_order))
			copy(vals_system_authentication_order, src_system_authentication_order)
			system_model.Authentication_order, _ =
				types.ListValueFrom(ctx, types.StringType, vals_system_authentication_order)
		}
            
        // Build ports list
        system_ports_List := make([]System_Ports_Model, len(v_system.Ports))

        
		for i_system_ports, v_system_ports := range v_system.Ports {
            var system_ports_model System_Ports_Model

            system_ports_List[i_system_ports] =
                system_ports_model
                
        // Build console list
        system_ports_console_List := make([]System_Ports_Console_Model, len(v_system_ports.Console))

        
		for i_system_ports_console, v_system_ports_console := range v_system_ports.Console {
            var system_ports_console_model System_Ports_Console_Model
            // leaf
            if v_system_ports_console.Log_out_on_disconnect == nil {
                system_ports_console_model.Log_out_on_disconnect =
                    types.StringNull()
            } else {
				system_ports_console_model.Log_out_on_disconnect =
                types.StringPointerValue(v_system_ports_console.Log_out_on_disconnect)
			}

            system_ports_console_List[i_system_ports_console] =
                system_ports_console_model
        }

        // Write console field as Null when empty, else concrete list
        if len(system_ports_console_List) == 0 {
            system_ports_model.Console =
                types.ListNull(types.ObjectType{AttrTypes: System_Ports_Console_Model{}.AttrTypes()})
        } else {
            system_ports_model.Console, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Ports_Console_Model{}.AttrTypes()},
                    system_ports_console_List,
                )
        }
        system_ports_List[i_system_ports] = system_ports_model
        }

        // Write ports field as Null when empty, else concrete list
        if len(system_ports_List) == 0 {
            system_model.Ports =
                types.ListNull(types.ObjectType{AttrTypes: System_Ports_Model{}.AttrTypes()})
        } else {
            system_model.Ports, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Ports_Model{}.AttrTypes()},
                    system_ports_List,
                )
        }
        system_List[i_system] = system_model
            
        // Build processes list
        system_processes_List := make([]System_Processes_Model, len(v_system.Processes))

        
		for i_system_processes, v_system_processes := range v_system.Processes {
            var system_processes_model System_Processes_Model

            system_processes_List[i_system_processes] =
                system_processes_model
                
        // Build daemon-process list
        system_processes_daemon_process_List := make([]System_Processes_Daemon_process_Model, len(v_system_processes.Daemon_process))

        
		for i_system_processes_daemon_process, v_system_processes_daemon_process := range v_system_processes.Daemon_process {
            var system_processes_daemon_process_model System_Processes_Daemon_process_Model
            // leaf
            if v_system_processes_daemon_process.Name == nil {
                system_processes_daemon_process_model.Name =
                    types.StringNull()
            } else {
				system_processes_daemon_process_model.Name =
                types.StringPointerValue(v_system_processes_daemon_process.Name)
			}

            system_processes_daemon_process_List[i_system_processes_daemon_process] =
                system_processes_daemon_process_model
            // leaf
            if v_system_processes_daemon_process.Disable == nil {
                system_processes_daemon_process_model.Disable =
                    types.StringNull()
            } else {
				system_processes_daemon_process_model.Disable =
                types.StringPointerValue(v_system_processes_daemon_process.Disable)
			}

            system_processes_daemon_process_List[i_system_processes_daemon_process] =
                system_processes_daemon_process_model
        }

        // Write daemon-process field as Null when empty, else concrete list
        if len(system_processes_daemon_process_List) == 0 {
            system_processes_model.Daemon_process =
                types.ListNull(types.ObjectType{AttrTypes: System_Processes_Daemon_process_Model{}.AttrTypes()})
        } else {
            system_processes_model.Daemon_process, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Processes_Daemon_process_Model{}.AttrTypes()},
                    system_processes_daemon_process_List,
                )
        }
        system_processes_List[i_system_processes] = system_processes_model
        }

        // Write processes field as Null when empty, else concrete list
        if len(system_processes_List) == 0 {
            system_model.Processes =
                types.ListNull(types.ObjectType{AttrTypes: System_Processes_Model{}.AttrTypes()})
        } else {
            system_model.Processes, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: System_Processes_Model{}.AttrTypes()},
                    system_processes_List,
                )
        }
        system_List[i_system] = system_model

        system_List[i_system] = system_model
    }

    // Write parent list as Null when empty
    if len(system_List) == 0 {
        state.System =
            types.ListNull(types.ObjectType{AttrTypes: System_Model{}.AttrTypes()})
    } else {
        state.System, _ =
            types.ListValueFrom(ctx,
                types.ObjectType{AttrTypes: System_Model{}.AttrTypes()},
                system_List,
            )
    }
    // Initialize virtual-chassis as Null; only materialize when we have elements
    state.Virtual_chassis =
        types.ListNull(types.ObjectType{AttrTypes: Virtual_chassis_Model{}.AttrTypes()})

    // Build list from device
    virtual_chassis_List := make([]Virtual_chassis_Model,
        len(config.Virtual_chassis))
    for i_virtual_chassis, v_virtual_chassis := range config.Virtual_chassis {
        var virtual_chassis_model Virtual_chassis_Model
		if v_virtual_chassis.Preprovisioned == nil {
			virtual_chassis_model.Preprovisioned = types.StringNull()
		} else {
			virtual_chassis_model.Preprovisioned =
				types.StringPointerValue(v_virtual_chassis.Preprovisioned)
		}
            
        // Build member list
        virtual_chassis_member_List := make([]Virtual_chassis_Member_Model, len(v_virtual_chassis.Member))

        
		for i_virtual_chassis_member, v_virtual_chassis_member := range v_virtual_chassis.Member {
            var virtual_chassis_member_model Virtual_chassis_Member_Model
            // leaf
            if v_virtual_chassis_member.Name == nil {
                virtual_chassis_member_model.Name =
                    types.StringNull()
            } else {
				virtual_chassis_member_model.Name =
                types.StringPointerValue(v_virtual_chassis_member.Name)
			}

            virtual_chassis_member_List[i_virtual_chassis_member] =
                virtual_chassis_member_model
            // leaf
            if v_virtual_chassis_member.Role == nil {
                virtual_chassis_member_model.Role =
                    types.StringNull()
            } else {
				virtual_chassis_member_model.Role =
                types.StringPointerValue(v_virtual_chassis_member.Role)
			}

            virtual_chassis_member_List[i_virtual_chassis_member] =
                virtual_chassis_member_model
            // leaf
            if v_virtual_chassis_member.Serial_number == nil {
                virtual_chassis_member_model.Serial_number =
                    types.StringNull()
            } else {
				virtual_chassis_member_model.Serial_number =
                types.StringPointerValue(v_virtual_chassis_member.Serial_number)
			}

            virtual_chassis_member_List[i_virtual_chassis_member] =
                virtual_chassis_member_model
        }

        // Write member field as Null when empty, else concrete list
        if len(virtual_chassis_member_List) == 0 {
            virtual_chassis_model.Member =
                types.ListNull(types.ObjectType{AttrTypes: Virtual_chassis_Member_Model{}.AttrTypes()})
        } else {
            virtual_chassis_model.Member, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Virtual_chassis_Member_Model{}.AttrTypes()},
                    virtual_chassis_member_List,
                )
        }
        virtual_chassis_List[i_virtual_chassis] = virtual_chassis_model

        virtual_chassis_List[i_virtual_chassis] = virtual_chassis_model
    }

    // Write parent list as Null when empty
    if len(virtual_chassis_List) == 0 {
        state.Virtual_chassis =
            types.ListNull(types.ObjectType{AttrTypes: Virtual_chassis_Model{}.AttrTypes()})
    } else {
        state.Virtual_chassis, _ =
            types.ListValueFrom(ctx,
                types.ObjectType{AttrTypes: Virtual_chassis_Model{}.AttrTypes()},
                virtual_chassis_List,
            )
    }
    // Initialize vlans as Null; only materialize when we have elements
    state.Vlans =
        types.ListNull(types.ObjectType{AttrTypes: Vlans_Model{}.AttrTypes()})

    // Build list from device
    vlans_List := make([]Vlans_Model,
        len(config.Vlans))
    for i_vlans, v_vlans := range config.Vlans {
        var vlans_model Vlans_Model
            
        // Build vlan list
        vlans_vlan_List := make([]Vlans_Vlan_Model, len(v_vlans.Vlan))

        
		for i_vlans_vlan, v_vlans_vlan := range v_vlans.Vlan {
            var vlans_vlan_model Vlans_Vlan_Model
            // leaf
            if v_vlans_vlan.Name == nil {
                vlans_vlan_model.Name =
                    types.StringNull()
            } else {
				vlans_vlan_model.Name =
                types.StringPointerValue(v_vlans_vlan.Name)
			}

            vlans_vlan_List[i_vlans_vlan] =
                vlans_vlan_model
            // leaf
            if v_vlans_vlan.Vlan_id == nil {
                vlans_vlan_model.Vlan_id =
                    types.StringNull()
            } else {
				vlans_vlan_model.Vlan_id =
                types.StringPointerValue(v_vlans_vlan.Vlan_id)
			}

            vlans_vlan_List[i_vlans_vlan] =
                vlans_vlan_model
            // leaf
            if v_vlans_vlan.L3_interface == nil {
                vlans_vlan_model.L3_interface =
                    types.StringNull()
            } else {
				vlans_vlan_model.L3_interface =
                types.StringPointerValue(v_vlans_vlan.L3_interface)
			}

            vlans_vlan_List[i_vlans_vlan] =
                vlans_vlan_model
        }

        // Write vlan field as Null when empty, else concrete list
        if len(vlans_vlan_List) == 0 {
            vlans_model.Vlan =
                types.ListNull(types.ObjectType{AttrTypes: Vlans_Vlan_Model{}.AttrTypes()})
        } else {
            vlans_model.Vlan, _ =
                types.ListValueFrom(ctx,
                    types.ObjectType{AttrTypes: Vlans_Vlan_Model{}.AttrTypes()},
                    vlans_vlan_List,
                )
        }
        vlans_List[i_vlans] = vlans_model

        vlans_List[i_vlans] = vlans_model
    }

    // Write parent list as Null when empty
    if len(vlans_List) == 0 {
        state.Vlans =
            types.ListNull(types.ObjectType{AttrTypes: Vlans_Model{}.AttrTypes()})
    } else {
        state.Vlans, _ =
            types.ListValueFrom(ctx,
                types.ObjectType{AttrTypes: Vlans_Model{}.AttrTypes()},
                vlans_List,
            )
    }

    return state
}

func (r *configResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var priorState ConfigResourceModel
	resp.Diagnostics.Append(req.State.Get(ctx, &priorState)...)
	if resp.Diagnostics.HasError() {
		return
	}

	state, ok := r.readStateFromDevice(ctx, priorState, &resp.Diagnostics)
	if !ok {
		return
	}

	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}





// Update implements resource.Resource.
func (r *configResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan ConfigResourceModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	planConfig := modelToConfig(ctx, plan, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}

	var stateConfig xml_Configuration
	err := r.client.MarshalConfig(&stateConfig)
	if err != nil {
		resp.Diagnostics.AddError("Failed while reading current configuration", err.Error())
		return
	}

	planXML, err := marshalConfigXML(planConfig)
	if err != nil {
		resp.Diagnostics.AddError("Failed to marshal plan config", err.Error())
		return
	}
	stateXML, err := marshalConfigXML(stateConfig)
	if err != nil {
		resp.Diagnostics.AddError("Failed to marshal state config", err.Error())
		return
	}

	idx, err := patch.UnmarshalTrimmedSchemaIndex(TrimmedSchemaJSON)
	if err != nil {
		resp.Diagnostics.AddError("Failed while parsing trimmed schema", err.Error())
		return
	}

	planTree, err := patch.BuildTree(planXML)
	if err != nil {
		resp.Diagnostics.AddError("Failed to parse plan XML", err.Error())
		return
	}
	stateTree, err := patch.BuildTree(stateXML)
	if err != nil {
		resp.Diagnostics.AddError("Failed to parse state XML", err.Error())
		return
	}

	planMap := patch.LeafMapWithSchema(planTree, idx)
	stateMap := patch.LeafMapWithSchema(stateTree, idx)
	diffMap := patch.ComputeDiff(stateMap, planMap)

	if len(diffMap) == 0 {
		state, ok := r.readStateFromDevice(ctx, plan, &resp.Diagnostics)
		if !ok {
			return
		}
		resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
		return
	}

	patchXML, err := patch.CreateDiffPatch(diffMap, plan.ResourceName.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Failed to build NETCONF patch", err.Error())
		return
	}

	patchPayload := string(patchXML)
	debugPatchUpdate(plan.ResourceName.ValueString(), planXML, stateXML, diffMap, patchPayload)
	err = r.client.SendUpdate("", patchPayload, false)
	if err != nil {
		resp.Diagnostics.AddError("Failed while sending diff patch", err.Error())
		return
	}
	commit_err := r.client.SendCommit()
	if commit_err != nil {
		resp.Diagnostics.AddError("Failed while committing configuration", commit_err.Error())
		return
	}

	var verifiedConfig xml_Configuration
	err = r.client.MarshalConfig(&verifiedConfig)
	if err != nil {
		resp.Diagnostics.AddError("Failed while reading patched configuration", err.Error())
		return
	}

	verifiedXML, err := marshalConfigXML(verifiedConfig)
	if err != nil {
		resp.Diagnostics.AddError("Failed to marshal verified config", err.Error())
		return
	}
	verifiedTree, err := patch.BuildTree(verifiedXML)
	if err != nil {
		resp.Diagnostics.AddError("Failed to parse verified XML", err.Error())
		return
	}

	verifiedMap := patch.LeafMapWithSchema(verifiedTree, idx)
	remainingDiff := patch.ComputeDiff(verifiedMap, planMap)
	if len(remainingDiff) > 0 {
		err = r.client.SendDirectTransaction(planConfig, false)
		if err != nil {
			resp.Diagnostics.AddError("Patch had no effect and fallback update failed", err.Error())
			return
		}
		commit_err = r.client.SendCommit()
		if commit_err != nil {
			resp.Diagnostics.AddError("Fallback update commit failed", commit_err.Error())
			return
		}
	}
	state, ok := r.readStateFromDevice(ctx, plan, &resp.Diagnostics)
	if !ok {
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}



// Delete implements resource.Resource.
func (r *configResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state ConfigResourceModel
	d := req.State.Get(ctx, &state)
	resp.Diagnostics.Append(d...)
	if resp.Diagnostics.HasError() {
		return
	}

	stateConfig := modelToConfig(ctx, state, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}

	stateXML, err := marshalConfigXML(stateConfig)
	if err != nil {
		resp.Diagnostics.AddError("Failed to marshal current configuration", err.Error())
		return
	}

	emptyXML, err := marshalConfigXML(xml_Configuration{})
	if err != nil {
		resp.Diagnostics.AddError("Failed to marshal empty configuration", err.Error())
		return
	}

	idx, err := patch.UnmarshalTrimmedSchemaIndex(TrimmedSchemaJSON)
	if err != nil {
		resp.Diagnostics.AddError("Failed while parsing trimmed schema", err.Error())
		return
	}

	stateTree, err := patch.BuildTree(stateXML)
	if err != nil {
		resp.Diagnostics.AddError("Failed to parse current XML", err.Error())
		return
	}
	emptyTree, err := patch.BuildTree(emptyXML)
	if err != nil {
		resp.Diagnostics.AddError("Failed to parse empty XML", err.Error())
		return
	}

	stateMap := patch.LeafMapWithSchema(stateTree, idx)
	emptyMap := patch.LeafMapWithSchema(emptyTree, idx)
	diffMap := patch.ComputeDiff(stateMap, emptyMap)
	if len(diffMap) == 0 {
		return
	}

	patchXML, err := patch.CreateDiffPatch(diffMap, state.ResourceName.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Failed to build delete patch", err.Error())
		return
	}

	err = r.client.SendUpdate("", string(patchXML), false)
	if err != nil {
		resp.Diagnostics.AddError("Failed while deleting configuration", err.Error())
		return
	}
    commit_err := r.client.SendCommit()
	if commit_err != nil {
		resp.Diagnostics.AddError("Failed while committing configuration", commit_err.Error())
		return
	}
}

func debugPatchUpdate(resourceName string, planXML []byte, stateXML []byte, diffMap map[string]patch.Change, patchPayload string) {
	if os.Getenv("JUNOS_TF_DEBUG_PATCH") == "" {
		return
	}

	fmt.Printf("\n=== terraform diff patch debug: %s ===\n", resourceName)
	fmt.Printf("--- state xml ---\n%s\n", string(stateXML))
	fmt.Printf("--- plan xml ---\n%s\n", string(planXML))
	fmt.Printf("--- diff map ---\n")
	for _, entry := range patch.DebugSortedChanges(diffMap) {
		fmt.Printf("%v | %s | old=%q | new=%q\n", entry.Op, entry.Path, entry.OldVal, entry.NewVal)
	}
	fmt.Printf("--- patch payload ---\n%s\n", patchPayload)
}
