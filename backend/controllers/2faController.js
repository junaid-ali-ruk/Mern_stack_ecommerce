import speakeasy from "speakeasy";
import qrcode from "qrcode";

export const generate2FASecret = async (req, res) => {
  const secret = speakeasy.generateSecret({
    name: `MyApp (${req.user.email})`,
  });

  req.user.twoFASecret = secret.base32;
  await req.user.save();

  qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
    res.json({ qrCode: data_url, secret: secret.base32 });
  });
};

export const verify2FAToken = async (req, res) => {
  const { token } = req.body;
  const verified = speakeasy.totp.verify({
    secret: req.user.twoFASecret,
    encoding: "base32",
    token,
  });

  if (verified) {
    req.user.isTwoFAEnabled = true;
    await req.user.save();
    return res.json({ message: "2FA enabled" });
  } else {
    return res.status(400).json({ message: "Invalid token" });
  }
};
