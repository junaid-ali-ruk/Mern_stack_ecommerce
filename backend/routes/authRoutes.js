const passwordResetController = require('../controllers/passwordResetController');
const twoFactorController = require('../controllers/twoFactorController');
const { checkPermission } = require('../middleware/rolePermission');
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRegister, validateLogin,validatePasswordReset } = require('../validators/authValidator');
const { authenticate } = require('../middleware/auth');



router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);


router.post('/password-reset/request', passwordResetController.requestPasswordReset);
router.post('/password-reset/:token', validatePasswordReset, passwordResetController.resetPassword);

router.post('/2fa/enable', authenticate, twoFactorController.enableTwoFactor);
router.post('/2fa/verify-setup', authenticate, twoFactorController.verifyAndEnable);
router.post('/2fa/verify', twoFactorController.verifyTwoFactorCode);
router.post('/2fa/disable', authenticate, twoFactorController.disableTwoFactor);

router.post('/login/2fa', authController.completeLoginWithTwoFactor);
router.post('/devices/trust', authenticate, authController.trustDevice);
router.get('/devices', authenticate, authController.getLoginHistory);
router.delete('/devices/:deviceId', authenticate, authController.removeDevice);

router.get('/admin/users',
    authenticate,
    checkPermission('users', 'read'),
    (req, res) => res.json({ message: 'Admin access granted' })
);

module.exports = router;