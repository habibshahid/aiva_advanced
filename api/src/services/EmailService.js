/**
 * Email Service
 * Sends emails using configured SMTP settings
 */

const SettingsService = require('./SettingsService');

// Import nodemailer - will be required at runtime
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  console.error('Nodemailer not installed. Run: npm install nodemailer');
}

class EmailService {
  
  /**
   * Get configured SMTP transporter
   * @returns {Promise<Object>} Nodemailer transporter
   */
  async getTransporter() {
    const config = await SettingsService.getSMTPConfig();
    
    if (!config.enabled || config.enabled === 'false') {
      throw new Error('Email sending is disabled');
    }
    
    if (!config.host || !config.user || !config.password) {
      throw new Error('SMTP configuration is incomplete');
    }
    
    return nodemailer.createTransport({
      host: config.host,
      port: parseInt(config.port) || 587,
      secure: config.secure === 'true', // true for 465, false for other ports
      auth: {
        user: config.user,
        pass: config.password
      }
    });
  }
  
  /**
   * Send email
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Send result
   */
  async sendEmail(options) {
    try {
      const config = await SettingsService.getSMTPConfig();
      const transporter = await this.getTransporter();
      
      const mailOptions = {
        from: `"${config.from_name || 'AIVA Platform'}" <${config.from_email || 'noreply@aiva.ai'}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
      };
      
      const info = await transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      console.error('Email send error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Send low balance notification
   * @param {Object} data - Notification data
   * @returns {Promise<Object>} Send result
   */
  async sendLowBalanceNotification(data) {
    const { tenant, balance, threshold, recipients } = data;
    
    // Ensure balance and threshold are numbers
    const balanceNum = parseFloat(balance) || 0;
    const thresholdNum = parseFloat(threshold) || 0;
    
    const subject = `⚠️ Low Credit Balance Alert - AIVA Platform`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                   color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert-box { background: #fff3cd; border-left: 4px solid #ffc107; 
                      padding: 15px; margin: 20px 0; }
          .balance-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .balance-amount { font-size: 32px; font-weight: bold; color: #e74c3c; }
          .threshold { font-size: 14px; color: #666; margin-top: 10px; }
          .cta-button { display: inline-block; background: #667eea; color: white; 
                       padding: 12px 30px; text-decoration: none; border-radius: 6px; 
                       margin: 20px 0; }
          .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💳 Low Credit Balance Alert</h1>
          </div>
          <div class="content">
            <div class="alert-box">
              <strong>⚠️ Attention Required:</strong> Your AIVA platform credit balance is running low.
            </div>
            
            <div class="balance-info">
              <p style="margin: 0; color: #666;">Current Balance</p>
              <div class="balance-amount">$${balanceNum.toFixed(2)}</div>
              <div class="threshold">Alert Threshold: $${thresholdNum.toFixed(2)}</div>
            </div>
            
            <p>To ensure uninterrupted service for your AI agents, please add credits to your account.</p>
            
            <p><strong>What happens if credits run out?</strong></p>
            <ul>
              <li>Voice agents will stop accepting calls</li>
              <li>Chat agents will stop responding</li>
              <li>Knowledge base search will be disabled</li>
              <li>All AI-powered features will be paused</li>
            </ul>
            
            <p style="text-align: center;">
              <a href="https://your-domain.com/aiva/credits" class="cta-button">
                Add Credits Now
              </a>
            </p>
            
            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              <strong>Account Details:</strong><br>
              Organization: ${tenant.name}<br>
              Company: ${tenant.company_name || 'N/A'}<br>
              Email: ${tenant.email}
            </p>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from AIVA Platform.</p>
            <p>To manage notification settings, visit your dashboard.</p>
            <p>&copy; ${new Date().getFullYear()} AIVA Platform. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const text = `
LOW CREDIT BALANCE ALERT

Your AIVA platform credit balance is running low.

Current Balance: $${balanceNum.toFixed(2)}
Alert Threshold: $${thresholdNum.toFixed(2)}

Please add credits to your account to ensure uninterrupted service.

Account Details:
Organization: ${tenant.name}
Company: ${tenant.company_name || 'N/A'}
Email: ${tenant.email}

Visit: https://your-domain.com/aiva/credits
    `.trim();
    
    // Send to all recipients
    const results = [];
    for (const recipient of recipients) {
      const result = await this.sendEmail({
        to: recipient,
        subject,
        html,
        text
      });
      
      // Log notification
      await SettingsService.logNotification({
        tenant_id: tenant.id,
        notification_type: 'low_balance',
        recipient_email: recipient,
        subject,
        status: result.success ? 'sent' : 'failed',
        error_message: result.error || null,
        metadata: { balance: balanceNum, threshold: thresholdNum }
      });
      
      results.push({ recipient, ...result });
    }
    
    // Update last notification sent
    await SettingsService.updateLastNotificationSent(tenant.id, 'low_balance');
    
    return results;
  }
  
  /**
   * Send test email
   * @param {string} toEmail - Recipient email
   * @returns {Promise<Object>} Send result
   */
  async sendTestEmail(toEmail) {
    const subject = 'Test Email from AIVA Platform';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                   color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .success-box { background: #d4edda; border-left: 4px solid #28a745; 
                        padding: 15px; margin: 20px 0; color: #155724; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Test Email</h1>
          </div>
          <div class="content">
            <div class="success-box">
              <strong>Success!</strong> Your SMTP configuration is working correctly.
            </div>
            <p>This is a test email from AIVA Platform to verify your email settings.</p>
            <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
            <p>If you received this email, your SMTP configuration is set up correctly and ready to send notifications.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const text = `
TEST EMAIL - AIVA Platform

Success! Your SMTP configuration is working correctly.

This is a test email to verify your email settings.
Sent at: ${new Date().toLocaleString()}

If you received this email, your SMTP configuration is ready to use.
    `.trim();
    
    return await this.sendEmail({
      to: toEmail,
      subject,
      html,
      text
    });
  }
  
  /**
   * Send daily summary email
   * @param {Object} data - Summary data
   * @returns {Promise<Object>} Send result
   */
  async sendDailySummary(data) {
    const { tenant, stats, recipients } = data;
    
    const subject = `📊 Daily Summary - AIVA Platform`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                   color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
          .stat-card { background: white; padding: 20px; border-radius: 8px; text-align: center; }
          .stat-number { font-size: 32px; font-weight: bold; color: #667eea; }
          .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Daily Summary</h1>
            <p>${new Date().toLocaleDateString()}</p>
          </div>
          <div class="content">
            <p>Here's your daily activity summary for ${tenant.name}:</p>
            
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-number">${stats.totalCalls || 0}</div>
                <div class="stat-label">Total Calls</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${stats.totalChats || 0}</div>
                <div class="stat-label">Chat Messages</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">$${(stats.totalCost || 0).toFixed(2)}</div>
                <div class="stat-label">Total Cost</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">$${(stats.balance || 0).toFixed(2)}</div>
                <div class="stat-label">Current Balance</div>
              </div>
            </div>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="https://your-domain.com/aiva" 
                 style="display: inline-block; background: #667eea; color: white; 
                        padding: 12px 30px; text-decoration: none; border-radius: 6px;">
                View Dashboard
              </a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const results = [];
    for (const recipient of recipients) {
      const result = await this.sendEmail({
        to: recipient,
        subject,
        html,
        text: `Daily Summary for ${tenant.name}\n\nTotal Calls: ${stats.totalCalls}\nTotal Chats: ${stats.totalChats}\nTotal Cost: $${stats.totalCost}\nBalance: $${stats.balance}`
      });
      
      results.push({ recipient, ...result });
    }
    
    return results;
  }
}

module.exports = new EmailService();