/**
 * Settings Service
 * Manages system settings (SMTP) and tenant notification settings
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Encryption key (should be in environment variable in production)
const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'your-32-character-secret-key!!';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

class SettingsService {
  
  /**
   * Encrypt sensitive data
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted text
   */
  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'utf-8').slice(0, 32),
      iv
    );
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }
  
  /**
   * Decrypt sensitive data
   * @param {string} text - Encrypted text
   * @returns {string} Decrypted text
   */
  decrypt(text) {
    try {
      const parts = text.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(
        ENCRYPTION_ALGORITHM,
        Buffer.from(ENCRYPTION_KEY, 'utf-8').slice(0, 32),
        iv
      );
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return '';
    }
  }
  
  // ============================================
  // SYSTEM SETTINGS (Super Admin)
  // ============================================
  
  /**
   * Get system setting
   * @param {string} key - Setting key
   * @returns {Promise<Object>} Setting
   */
  async getSystemSetting(key) {
    const [settings] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_system_settings WHERE setting_key = ?',
      [key]
    );
    
    if (settings.length === 0) return null;
    
    const setting = settings[0];
    
    // Decrypt if needed
    if (setting.is_encrypted && setting.setting_value) {
      setting.setting_value = this.decrypt(setting.setting_value);
    }
    
    return setting;
  }
  
  /**
   * Get all system settings by type
   * @param {string} type - Setting type (smtp, general, api, security)
   * @returns {Promise<Array>} Settings
   */
  async getSystemSettings(type = null) {
    let query = 'SELECT * FROM yovo_tbl_aiva_system_settings';
    const params = [];
    
    if (type) {
      query += ' WHERE setting_type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY setting_key';
    
    const [settings] = await db.query(query, params);
    
    // Decrypt encrypted settings
    return settings.map(setting => {
      if (setting.is_encrypted && setting.setting_value) {
        setting.setting_value = this.decrypt(setting.setting_value);
      }
      return setting;
    });
  }
  
  /**
   * Get SMTP configuration
   * @returns {Promise<Object>} SMTP config
   */
  async getSMTPConfig() {
    const settings = await this.getSystemSettings('smtp');
    
    const config = {};
    settings.forEach(setting => {
      // Remove 'smtp_' prefix from key
      const key = setting.setting_key.replace('smtp_', '');
      config[key] = setting.setting_value;
    });
    
    return config;
  }
  
  /**
   * Update system setting (creates if doesn't exist)
   * @param {string} key - Setting key
   * @param {string} value - Setting value
   * @returns {Promise<Object>} Updated setting
   */
  async updateSystemSetting(key, value) {
    const existing = await this.getSystemSetting(key);
    
    if (!existing) {
      // Auto-create setting if it doesn't exist
      const settingType = key.startsWith('smtp_') ? 'smtp' : 'general';
      const isEncrypted = key === 'smtp_password' ? 1 : 0;
      
      await this.createSystemSetting({
        setting_key: key,
        setting_value: value,
        setting_type: settingType,
        is_encrypted: isEncrypted,
        description: `Auto-created: ${key}`
      });
      
      return await this.getSystemSetting(key);
    }
    
    // Encrypt if needed
    const finalValue = existing.is_encrypted ? this.encrypt(value) : value;
    
    await db.query(
      'UPDATE yovo_tbl_aiva_system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?',
      [finalValue, key]
    );
    
    return await this.getSystemSetting(key);
  }
  
  /**
   * Update multiple system settings
   * @param {Object} settings - Key-value pairs
   * @returns {Promise<void>}
   */
  async updateSystemSettings(settings) {
    for (const [key, value] of Object.entries(settings)) {
      await this.updateSystemSetting(key, value);
    }
  }
  
  /**
   * Create system setting
   * @param {Object} data - Setting data
   * @returns {Promise<Object>} Created setting
   */
  async createSystemSetting(data) {
    const { setting_key, setting_value, setting_type, is_encrypted, description } = data;
    const id = uuidv4();
    
    const finalValue = is_encrypted ? this.encrypt(setting_value) : setting_value;
    
    await db.query(
      `INSERT INTO yovo_tbl_aiva_system_settings 
       (id, setting_key, setting_value, setting_type, is_encrypted, description) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, setting_key, finalValue, setting_type || 'general', is_encrypted || 0, description]
    );
    
    return await this.getSystemSetting(setting_key);
  }
  
  /**
   * Test SMTP configuration
   * @param {Object} config - SMTP config to test
   * @returns {Promise<Object>} Test result
   */
  async testSMTPConfig(config) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: parseInt(config.port),
        secure: config.secure === 'true',
        auth: {
          user: config.user,
          pass: config.password
        }
      });
      
      // Verify connection
      await transporter.verify();
      
      return { success: true, message: 'SMTP configuration is valid' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  
  // ============================================
  // TENANT NOTIFICATION SETTINGS
  // ============================================
  
  /**
   * Get tenant notification settings
   * @param {string} tenantId - Tenant ID
   * @param {string} notificationType - Optional notification type filter
   * @returns {Promise<Array>} Notification settings
   */
  async getTenantNotificationSettings(tenantId, notificationType = null) {
    let query = 'SELECT * FROM yovo_tbl_aiva_tenant_notification_settings WHERE tenant_id = ?';
    const params = [tenantId];
    
    if (notificationType) {
      query += ' AND notification_type = ?';
      params.push(notificationType);
    }
    
    const [settings] = await db.query(query, params);
    
    return settings.map(setting => {
      // Parse recipient_emails - handle both JSON array and plain string
      let recipientEmails = [];
      if (setting.recipient_emails) {
        try {
          recipientEmails = JSON.parse(setting.recipient_emails);
        } catch (e) {
          // If not valid JSON, treat as single email string
          recipientEmails = [setting.recipient_emails];
        }
      }
      
      // Parse settings JSON
      let settingsObj = {};
      if (setting.settings) {
        try {
          settingsObj = JSON.parse(setting.settings);
        } catch (e) {
          settingsObj = {};
        }
      }
      
      return {
        ...setting,
        recipient_emails: recipientEmails,
        settings: settingsObj
      };
    });
  }
  
  /**
   * Get specific notification setting
   * @param {string} tenantId - Tenant ID
   * @param {string} notificationType - Notification type
   * @returns {Promise<Object>} Notification setting
   */
  async getNotificationSetting(tenantId, notificationType) {
    const settings = await this.getTenantNotificationSettings(tenantId, notificationType);
    return settings.length > 0 ? settings[0] : null;
  }
  
  /**
   * Create or update tenant notification setting
   * @param {string} tenantId - Tenant ID
   * @param {Object} data - Notification setting data
   * @returns {Promise<Object>} Created/updated setting
   */
  async upsertNotificationSetting(tenantId, data) {
    const {
      notification_type,
      is_enabled,
      threshold_value,
      threshold_percentage,
      recipient_emails,
      notification_frequency,
      settings
    } = data;
    
    const existing = await this.getNotificationSetting(tenantId, notification_type);
    
    const recipientEmailsJson = JSON.stringify(recipient_emails || []);
    const settingsJson = JSON.stringify(settings || {});
    
    if (existing) {
      // Update
      await db.query(
        `UPDATE yovo_tbl_aiva_tenant_notification_settings 
         SET is_enabled = ?, threshold_value = ?, threshold_percentage = ?, 
             recipient_emails = ?, notification_frequency = ?, settings = ?, updated_at = NOW()
         WHERE tenant_id = ? AND notification_type = ?`,
        [
          is_enabled !== undefined ? is_enabled : existing.is_enabled,
          threshold_value !== undefined ? threshold_value : existing.threshold_value,
          threshold_percentage !== undefined ? threshold_percentage : existing.threshold_percentage,
          recipientEmailsJson,
          notification_frequency || existing.notification_frequency,
          settingsJson,
          tenantId,
          notification_type
        ]
      );
    } else {
      // Create
      const id = uuidv4();
      await db.query(
        `INSERT INTO yovo_tbl_aiva_tenant_notification_settings 
         (id, tenant_id, notification_type, is_enabled, threshold_value, threshold_percentage, 
          recipient_emails, notification_frequency, settings) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          tenantId,
          notification_type,
          is_enabled !== undefined ? is_enabled : 1,
          threshold_value || null,
          threshold_percentage || null,
          recipientEmailsJson,
          notification_frequency || 'immediate',
          settingsJson
        ]
      );
    }
    
    return await this.getNotificationSetting(tenantId, notification_type);
  }
  
  /**
   * Delete notification setting
   * @param {string} tenantId - Tenant ID
   * @param {string} notificationType - Notification type
   * @returns {Promise<void>}
   */
  async deleteNotificationSetting(tenantId, notificationType) {
    await db.query(
      'DELETE FROM yovo_tbl_aiva_tenant_notification_settings WHERE tenant_id = ? AND notification_type = ?',
      [tenantId, notificationType]
    );
  }
  
  /**
   * Check if low balance notification should be sent
   * @param {string} tenantId - Tenant ID
   * @param {number} currentBalance - Current credit balance
   * @returns {Promise<boolean>} Should notify
   */
  async shouldSendLowBalanceNotification(tenantId, currentBalance) {
    const setting = await this.getNotificationSetting(tenantId, 'low_balance');
    
    if (!setting || !setting.is_enabled) {
      return false;
    }
    
    // Check threshold
    if (setting.threshold_value && currentBalance <= setting.threshold_value) {
      // Check if notification was sent recently (prevent spam)
      if (setting.last_notification_sent) {
        const hoursSinceLastNotification = 
          (Date.now() - new Date(setting.last_notification_sent).getTime()) / (1000 * 60 * 60);
        
        // Don't send more than once every 24 hours
        if (hoursSinceLastNotification < 24) {
          return false;
        }
      }
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Update last notification sent timestamp
   * @param {string} tenantId - Tenant ID
   * @param {string} notificationType - Notification type
   * @returns {Promise<void>}
   */
  async updateLastNotificationSent(tenantId, notificationType) {
    await db.query(
      'UPDATE yovo_tbl_aiva_tenant_notification_settings SET last_notification_sent = NOW() WHERE tenant_id = ? AND notification_type = ?',
      [tenantId, notificationType]
    );
  }
  
  /**
   * Log notification
   * @param {Object} data - Notification log data
   * @returns {Promise<string>} Log ID
   */
  async logNotification(data) {
    const {
      tenant_id,
      notification_type,
      recipient_email,
      subject,
      status,
      error_message,
      metadata
    } = data;
    
    const id = uuidv4();
    const metadataJson = JSON.stringify(metadata || {});
    
    await db.query(
      `INSERT INTO yovo_tbl_aiva_notification_log 
       (id, tenant_id, notification_type, recipient_email, subject, status, error_message, metadata, sent_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        tenant_id,
        notification_type,
        recipient_email,
        subject,
        status,
        error_message || null,
        metadataJson
      ]
    );
    
    return id;
  }
  
  /**
   * Get notification logs
   * @param {string} tenantId - Tenant ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Notification logs
   */
  async getNotificationLogs(tenantId, filters = {}) {
    let query = 'SELECT * FROM yovo_tbl_aiva_notification_log WHERE tenant_id = ?';
    const params = [tenantId];
    
    if (filters.notification_type) {
      query += ' AND notification_type = ?';
      params.push(filters.notification_type);
    }
    
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    query += ' ORDER BY sent_at DESC LIMIT ?';
    params.push(filters.limit || 100);
    
    const [logs] = await db.query(query, params);
    
    return logs.map(log => ({
      ...log,
      metadata: log.metadata ? (log.metadata) : {}
    }));
  }
}

module.exports = new SettingsService();