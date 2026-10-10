const dns = require('dns').promises;
const net = require('net');

function isPublicIpv4(address) {
    if (net.isIP(address) !== 4) return false;
    const [a, b, c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
}

async function resolvePublicHttpUrl(rawUrl, lookup = dns.lookup) {
    let url;
    try { url = new URL(rawUrl); } catch (_) { return null; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) return null;
    if (net.isIP(url.hostname) === 6) return null;
    let address = url.hostname;
    if (net.isIP(address) !== 4) {
        try { address = (await lookup(url.hostname, { family: 4 })).address; }
        catch (_) { return null; }
    }
    return isPublicIpv4(address) ? { url, address } : null;
}

module.exports = { isPublicIpv4, resolvePublicHttpUrl };
