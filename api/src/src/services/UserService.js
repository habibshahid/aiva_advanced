/**
 * User Service
 * Manages user CRUD operations and authentication
 */

const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class UserService {
  
  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User or null
   */
  async getUser(userId) {
    const [users] = await db.query(`
      SELECT 
        u.*,
        t.name as tenant_name,
        t.company_name,
        t.credit_balance as tenant_credit_balance
      FROM yovo_tbl_aiva_users u
      JOIN yovo_tbl_aiva_tenants t ON u.tenant_id = t.id
      WHERE u.id = ?
    `, [userId]);
    
    if (users.length === 0) {
      return null;
    }
    
    const user = users[0];
    delete user.password_hash; // Never return password hash
    return user;
  }
  
  /**
   * Get user by email
   * @param {string} email - Email
   * @returns {Promise<Object|null>} User or null
   */
  async getUserByEmail(email) {
    const [users] = await db.query(`
      SELECT 
        u.*,
        t.name as tenant_name,
        t.company_name,
        t.credit_balance as tenant_credit_balance
      FROM yovo_tbl_aiva_users u
      JOIN yovo_tbl_aiva_tenants t ON u.tenant_id = t.id
      WHERE u.email = ? AND u.is_active = TRUE
    `, [email]);
    
    if (users.length === 0) {
      return null;
    }
    
    return users[0];
  }
  
  /**
   * List users for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} filters - Filters
   * @returns {Promise<Array>} Users
   */
  async listUsers(tenantId, filters = {}) {
    let query = `
      SELECT 
        u.id,
        u.tenant_id,
        u.email,
        u.name,
        u.role,
        u.is_active,
        u.last_login_at,
        u.created_at
      FROM yovo_tbl_aiva_users u
      WHERE u.tenant_id = ?
    `;
    const params = [tenantId];
    
    if (filters.role) {
      query += ' AND u.role = ?';
      params.push(filters.role);
    }
    
    if (filters.is_active !== undefined) {
      query += ' AND u.is_active = ?';
      params.push(filters.is_active);
    }
    
    query += ' ORDER BY u.created_at DESC';
    
    const [users] = await db.query(query, params);
    return users;
  }
  
  /**
   * Create user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user
   */
  async createUser(userData) {
    const { tenant_id, email, password, name, role = 'client' } = userData;
    
    // Check if email already exists
    const existing = await this.getUserByEmail(email);
    if (existing) {
      throw new Error('Email already exists');
    }
    
    // Validate role
    const validRoles = ['super_admin', 'admin', 'agent_manager', 'client'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role');
    }
    
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    const userId = uuidv4();
    
    await db.query(`
      INSERT INTO yovo_tbl_aiva_users (
        id, tenant_id, email, password_hash, name, role
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, tenant_id, email, password_hash, name, role]);
    
    return this.getUser(userId);
  }
  
  /**
   * Update user
   * @param {string} userId - User ID
   * @param {Object} updates - Updates
   * @returns {Promise<Object>} Updated user
   */
  async updateUser(userId, updates) {
    const fields = [];
    const values = [];
    
    const allowedFields = ['name', 'email', 'role', 'is_active'];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }
    
    // Handle password update separately
    if (updates.password) {
      fields.push('password_hash = ?');
      values.push(await bcrypt.hash(updates.password, 10));
    }
    
    if (fields.length === 0) {
      return this.getUser(userId);
    }
    
    values.push(userId);
    
    await db.query(
      `UPDATE yovo_tbl_aiva_users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    
    return this.getUser(userId);
  }
  
  /**
   * Delete user
   * @param {string} userId - User ID
   */
  async deleteUser(userId) {
    await db.query('DELETE FROM yovo_tbl_aiva_users WHERE id = ?', [userId]);
  }
  
  /**
   * Verify password
   * @param {string} plainPassword - Plain password
   * @param {string} hashedPassword - Hashed password
   * @returns {Promise<boolean>} Valid or not
   */
  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
  
  /**
   * Update last login time
   * @param {string} userId - User ID
   */
  async updateLastLogin(userId) {
    await db.query(
      'UPDATE yovo_tbl_aiva_users SET last_login_at = NOW() WHERE id = ?',
      [userId]
    );
  }
  
  /**
   * Log user action
   * @param {Object} logData - Log data
   */
  async logAction(logData) {
    const { user_id, tenant_id, action, resource_type, resource_id, details, ip_address } = logData;
    
    const logId = uuidv4();
    
    await db.query(`
      INSERT INTO yovo_tbl_aiva_user_audit_log (
        id, user_id, tenant_id, action, resource_type, 
        resource_id, details, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      logId,
      user_id,
      tenant_id,
      action,
      resource_type || null,
      resource_id || null,
      details ? JSON.stringify(details) : null,
      ip_address || null
    ]);
  }
  
  /**
   * Get user audit log
   * @param {string} userId - User ID
   * @param {Object} filters - Filters
   * @returns {Promise<Array>} Audit logs
   */
  async getAuditLog(userId, filters = {}) {
    let query = `
      SELECT * FROM yovo_tbl_aiva_user_audit_log
      WHERE user_id = ?
    `;
    const params = [userId];
    
    if (filters.action) {
      query += ' AND action = ?';
      params.push(filters.action);
    }
    
    if (filters.resource_type) {
      query += ' AND resource_type = ?';
      params.push(filters.resource_type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(filters.limit || 100);
    
    const [logs] = await db.query(query, params);
    
    return logs.map(log => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null
    }));
  }
}

module.exports = new UserService();