exports.sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset</h1>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

exports.sendPasswordChangeConfirmation = async (email) => {
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Password Changed Successfully',
    html: `
      <h1>Password Changed</h1>
      <p>Your password has been successfully changed.</p>
      <p>If you didn't make this change, please contact support immediately.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

exports.sendTwoFactorCode = async (email, code) => {
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Your Two-Factor Authentication Code',
    html: `
      <h1>Two-Factor Authentication</h1>
      <p>Your verification code is:</p>
      <h2 style="font-size: 32px; letter-spacing: 5px; color: #007bff;">${code}</h2>
      <p>This code will expire in 10 minutes.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

exports.sendNewDeviceAlert = async (email, deviceInfo) => {
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'New Device Login Detected',
    html: `
      <h1>New Device Login</h1>
      <p>A new device just logged into your account:</p>
      <ul>
        <li>Browser: ${deviceInfo.browser}</li>
        <li>OS: ${deviceInfo.os}</li>
        <li>Location: ${deviceInfo.location?.city}, ${deviceInfo.location?.country}</li>
        <li>IP: ${deviceInfo.ip}</li>
      </ul>
      <p>If this wasn't you, please secure your account immediately.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};