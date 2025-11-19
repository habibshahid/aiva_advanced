/**
 * Settings Routes
 * Manages system settings and tenant notification settings
 */

const express = require('express');
const router = express.Router();
const SettingsService = require('../services/SettingsService');
const EmailService = require('../services/EmailService');
const { verifyToken } = require('../middleware/auth');
const ResponseBuilder = require('../utils/response-builder');

// ============================================
// SYSTEM SETTINGS (Super Admin Only)
// ============================================

/**
 * @route GET /api/settings/system
 * @desc Get all system settings
 * @access Private (super_admin only)
 */
router.get('/system', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    // Only super_admin can access system settings
    if (req.user.role !== 'super_admin') {
      return res.status(403).json(rb.forbidden());
    }

    const { type } = req.query;
    const settings = await SettingsService.getSystemSettings(type);

    res.json(rb.success({ settings, count: settings.length }));

  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/settings/system/smtp
 * @desc Get SMTP configuration
 * @access Private (super_admin only)
 */
router.get('/system/smtp', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json(rb.forbidden());
    }

    const config = await SettingsService.getSMTPConfig();

    res.json(rb.success(config));

  } catch (error) {
    console.error('Get SMTP config error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route PUT /api/settings/system
 * @desc Update system settings
 * @access Private (super_admin only)
 */
router.put('/system', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json(rb.forbidden());
    }

    const settings = req.body;
    await SettingsService.updateSystemSettings(settings);

    res.json(rb.success(null, 'Settings updated successfully'));

  } catch (error) {
    console.error('Update system settings error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/settings/system/smtp/test
 * @desc Test SMTP configuration
 * @access Private (super_admin only)
 */
router.post('/system/smtp/test', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json(rb.forbidden());
    }

    const { config, test_email } = req.body;

    if (test_email) {
      // Test by sending actual email
      const result = await EmailService.sendTestEmail(test_email);
      return res.json(rb.success(result));
    } else {
      // Test connection only
      const result = await SettingsService.testSMTPConfig(config || await SettingsService.getSMTPConfig());
      return res.json(rb.success(result));
    }

  } catch (error) {
    console.error('Test SMTP error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

// ============================================
// TENANT NOTIFICATION SETTINGS
// ============================================

/**
 * @route GET /api/settings/notifications
 * @desc Get tenant notification settings
 * @access Private (admin, super_admin)
 */
router.get('/notifications', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    // Only admin and super_admin can manage notification settings
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json(rb.forbidden());
    }

    const { notification_type } = req.query;
    const settings = await SettingsService.getTenantNotificationSettings(
      req.user.tenant_id,
      notification_type
    );

    res.json(rb.success({ settings, count: settings.length }));

  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/settings/notifications/:notification_type
 * @desc Get specific notification setting
 * @access Private (admin, super_admin)
 */
router.get('/notifications/:notification_type', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json(rb.forbidden());
    }

    const setting = await SettingsService.getNotificationSetting(
      req.user.tenant_id,
      req.params.notification_type
    );

    if (!setting) {
      return res.status(404).json(ResponseBuilder.notFound('Notification setting'));
    }

    res.json(rb.success(setting));

  } catch (error) {
    console.error('Get notification setting error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route PUT /api/settings/notifications/:notification_type
 * @desc Create or update notification setting
 * @access Private (admin, super_admin)
 */
router.put('/notifications/:notification_type', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json(rb.forbidden());
    }

    const data = {
      notification_type: req.params.notification_type,
      ...req.body
    };

    const setting = await SettingsService.upsertNotificationSetting(
      req.user.tenant_id,
      data
    );

    res.json(rb.success(setting, 'Notification setting updated successfully'));

  } catch (error) {
    console.error('Update notification setting error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route DELETE /api/settings/notifications/:notification_type
 * @desc Delete notification setting
 * @access Private (admin, super_admin)
 */
router.delete('/notifications/:notification_type', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json(rb.forbidden());
    }

    await SettingsService.deleteNotificationSetting(
      req.user.tenant_id,
      req.params.notification_type
    );

    res.json(rb.success(null, 'Notification setting deleted successfully'));

  } catch (error) {
    console.error('Delete notification setting error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/settings/notifications/logs
 * @desc Get notification logs
 * @access Private (admin, super_admin)
 */
router.get('/notifications-logs', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json(rb.forbidden());
    }

    const { notification_type, status, limit } = req.query;

    const logs = await SettingsService.getNotificationLogs(
      req.user.tenant_id,
      { notification_type, status, limit: parseInt(limit) || 100 }
    );

    res.json(rb.success({ logs, count: logs.length }));

  } catch (error) {
    console.error('Get notification logs error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/settings/notifications/test
 * @desc Test notification by sending test email
 * @access Private (admin, super_admin)
 */
router.post('/notifications/test', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json(rb.forbidden());
    }

    const { notification_type, recipient_email } = req.body;

    if (!notification_type || !recipient_email) {
      return res.status(400).json(rb.badRequest('notification_type and recipient_email required'));
    }

    // Send test notification based on type
    let result;
    if (notification_type === 'low_balance') {
      result = await EmailService.sendLowBalanceNotification({
        tenant: {
          id: req.user.tenant_id,
          name: req.user.name,
          company_name: req.user.company_name,
          email: req.user.email
        },
        balance: req.user.credit_balance || 0,
        threshold: 10.00,
        recipients: [recipient_email]
      });
    } else {
      return res.status(400).json(rb.badRequest('Invalid notification type for testing'));
    }

    res.json(rb.success(result, 'Test notification sent'));

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

module.exports = router;