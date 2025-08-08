const useragent = require('useragent');
const geoip = require('geoip-lite');
const crypto = require('crypto');

exports.trackDevice = async (user, req) => {
  const ua = useragent.parse(req.headers['user-agent']);
  const ip = req.ip || req.connection.remoteAddress;
  const geo = geoip.lookup(ip);

  const deviceInfo = {
    userAgent: req.headers['user-agent'],
    browser: ua.toAgent(),
    os: ua.os.toString(),
    device: ua.device.toString(),
    ip,
    location: geo ? {
      country: geo.country,
      region: geo.region,
      city: geo.city
    } : null
  };

  const deviceId = crypto
    .createHash('sha256')
    .update(`${deviceInfo.userAgent}${ip}`)
    .digest('hex');

  const existingDevice = user.devices.find(d => d.deviceId === deviceId);

  if (existingDevice) {
    existingDevice.lastUsed = new Date();
    existingDevice.location = deviceInfo.location;
  } else {
    user.devices.push({
      deviceId,
      ...deviceInfo,
      lastUsed: new Date(),
      trusted: false
    });

    if (user.devices.length > 10) {
      user.devices.sort((a, b) => b.lastUsed - a.lastUsed);
      user.devices = user.devices.slice(0, 10);
    }
  }

  await user.save();
  return deviceId;
};

exports.trackLoginAttempt = async (user, req, success) => {
  const ip = req.ip || req.connection.remoteAddress;
  const geo = geoip.lookup(ip);

  const attempt = {
    timestamp: new Date(),
    ip,
    userAgent: req.headers['user-agent'],
    location: geo ? {
      country: geo.country,
      region: geo.region,
      city: geo.city,
      coordinates: {
        latitude: geo.ll[0],
        longitude: geo.ll[1]
      }
    } : null,
    success
  };

  user.loginAttempts.unshift(attempt);
  
  if (user.loginAttempts.length > 50) {
    user.loginAttempts = user.loginAttempts.slice(0, 50);
  }

  await user.save();
};

exports.isNewDevice = (user, req) => {
  const ip = req.ip || req.connection.remoteAddress;
  const deviceId = crypto
    .createHash('sha256')
    .update(`${req.headers['user-agent']}${ip}`)
    .digest('hex');

  return !user.devices.some(d => d.deviceId === deviceId && d.trusted);
};