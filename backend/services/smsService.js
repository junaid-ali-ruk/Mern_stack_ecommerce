const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

exports.sendTwoFactorCode = async (phone, code) => {
  await client.messages.create({
    body: `Your verification code is: ${code}. Valid for 10 minutes.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone
  });
};

exports.sendLoginAlert = async (phone, location) => {
  await client.messages.create({
    body: `New login detected from ${location}. If this wasn't you, secure your account.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone
  });
};