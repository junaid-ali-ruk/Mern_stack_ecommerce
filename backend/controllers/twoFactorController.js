const User = require('../models/User');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const emailService = require('../services/emailService');
 

exports.enableTwoFactor = async (req, res) => {
  try {
    const { method } = req.body;
    const user = await User.findById(req.userId);

    if (method === 'authenticator') {
      const secret = speakeasy.generateSecret({
        name: `YourStore (${user.email})`
      });

      user.twoFactorSecret = secret.base32;
      user.twoFactorMethod = 'authenticator';

      const backupCodes = Array.from({ length: 10 }, () => 
        crypto.randomBytes(4).toString('hex').toUpperCase()
      );
      user.twoFactorBackupCodes = backupCodes.map(code => 
        crypto.createHash('sha256').update(code).digest('hex')
      );

      await user.save();

      const dataURL = await qrcode.toDataURL(secret.otpauth_url);

      res.json({
        qrCode: dataURL,
        backupCodes,
        secret: secret.base32
      });
    } else {
      user.twoFactorMethod = method;
      await user.save();
      
      res.json({ message: `2FA will be sent via ${method}` });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyAndEnable = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.userId);

    if (user.twoFactorMethod === 'authenticator') {
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 2
      });

      if (!verified) {
        return res.status(400).json({ message: 'Invalid verification code' });
      }
    }

    user.twoFactorEnabled = true;
    await user.save();

    res.json({ message: '2FA enabled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.sendTwoFactorCode = async (userId, method) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const user = await User.findById(userId);
  
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
  user.twoFactorTempCode = hashedCode;
  user.twoFactorTempExpires = Date.now() + 600000;
  await user.save();

  if (method === 'email') {
    await emailService.sendTwoFactorCode(user.email, code);
  } 

  return true;
};

exports.verifyTwoFactorCode = async (req, res) => {
  try {
    const { code, userId } = req.body;
    const user = await User.findById(userId);

    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    let verified = false;

    if (user.twoFactorMethod === 'authenticator') {
      verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 2
      });
    } else {
      const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
      if (user.twoFactorTempCode === hashedCode && 
          user.twoFactorTempExpires > Date.now()) {
        verified = true;
        user.twoFactorTempCode = undefined;
        user.twoFactorTempExpires = undefined;
        await user.save();
      }
    }

    if (!verified) {
      const hashedBackupCode = crypto.createHash('sha256').update(code).digest('hex');
      const backupIndex = user.twoFactorBackupCodes.indexOf(hashedBackupCode);
      
      if (backupIndex !== -1) {
        user.twoFactorBackupCodes.splice(backupIndex, 1);
        await user.save();
        verified = true;
      }
    }

    if (!verified) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    res.json({ message: '2FA verification successful', verified: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.disableTwoFactor = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = [];
    user.twoFactorMethod = 'email';
    await user.save();

    res.json({ message: '2FA disabled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};