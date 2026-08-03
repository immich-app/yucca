// Resolve the OIDC issuer host to the kubectl port-forward for host-side jest fetch (undici).
const dns = require('dns');
const MAP = { 'oidc.localhost': '127.0.0.1', 'yucca-mock-oidc': '127.0.0.1' };
const origLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (MAP[hostname]) {
    const rec = { address: MAP[hostname], family: 4 };
    if (options && options.all) return process.nextTick(callback, null, [rec]);
    return process.nextTick(callback, null, rec.address, 4);
  }
  return origLookup.call(this, hostname, options || {}, callback);
};
if (dns.promises && dns.promises.lookup) {
  const origP = dns.promises.lookup;
  dns.promises.lookup = async function (hostname, options) {
    if (MAP[hostname]) {
      const rec = { address: MAP[hostname], family: 4 };
      return options && options.all ? [rec] : rec;
    }
    return origP.call(this, hostname, options);
  };
}
