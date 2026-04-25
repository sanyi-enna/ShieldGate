function getIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const remote = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  return remote.replace(/^::ffff:/, '');
}

module.exports = getIP;
