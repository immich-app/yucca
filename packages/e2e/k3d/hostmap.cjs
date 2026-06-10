// e2e-against-k3d glue: the deployed yucca-api advertises its OIDC issuer as the
// in-cluster name http://yucca-mock-oidc:8092. Host-side fetch() (undici) in the
// jest e2e must resolve that name to the kubectl port-forward on localhost.
const dns = require('dns');
const MAP = { 'yucca-mock-oidc': '127.0.0.1' };
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
