/**
 * Tenant Service
 * Handles tenant CRUD operations for service provider management
 * File: api/src/services/TenantService.js
 */

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

class TenantService {
  
  /**
   * List all tenants (for super_admin)
   */
  static async listTenants(options = {}) {
    const { 
      search = '', 
      is_active, 
      limit = 50, 
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options;

    let query = `
      SELECT 
        t.id,
        t.name,
        t.company_name,
        t.email,
        t.api_key,
        t.credit_balance,
        t.is_active,
        t.created_at,
        t.updated_at,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_users WHERE tenant_id = t.id) as user_count,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_agents WHERE tenant_id = t.id) as agent_count,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_call_logs WHERE tenant_id = t.id) as total_calls,
        (SELECT name FROM yovo_tbl_aiva_users WHERE tenant_id = t.id AND role = 'admin' LIMIT 1) as admin_name,
        (SELECT email FROM yovo_tbl_aiva_users WHERE tenant_id = t.id AND role = 'admin' LIMIT 1) as admin_email
      FROM yovo_tbl_aiva_tenants t
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      query += ` AND (t.name LIKE ? OR t.company_name LIKE ? OR t.email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (is_active !== undefined) {
      query += ` AND t.is_active = ?`;
      params.push(is_active);
    }

    // Validate sort column to prevent SQL injection
    const allowedSortColumns = ['created_at', 'name', 'company_name', 'credit_balance', 'is_active'];
    const sortColumn = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDir = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY t.${sortColumn} ${sortDir} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [tenants] = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM yovo_tbl_aiva_tenants t WHERE 1=1`;
    const countParams = [];

    if (search) {
      countQuery += ` AND (t.name LIKE ? OR t.company_name LIKE ? OR t.email LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (is_active !== undefined) {
      countQuery += ` AND t.is_active = ?`;
      countParams.push(is_active);
    }

    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    return {
      tenants: tenants.map(t => ({
        ...t,
        api_key_masked: t.api_key ? `${t.api_key.substring(0, 7)}...${t.api_key.substring(t.api_key.length - 4)}` : null
      })),
      total,
      limit,
      offset
    };
  }

  /**
   * Get single tenant by ID
   */
  static async getTenant(tenantId) {
    const [tenants] = await db.query(`
      SELECT 
        t.*,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_users WHERE tenant_id = t.id) as user_count,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_agents WHERE tenant_id = t.id) as agent_count,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_call_logs WHERE tenant_id = t.id) as total_calls,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_chat_sessions WHERE tenant_id = t.id) as total_chat_sessions,
        (SELECT SUM(final_cost) FROM yovo_tbl_aiva_call_logs WHERE tenant_id = t.id) as total_call_cost,
        (SELECT SUM(total_cost) FROM yovo_tbl_aiva_chat_sessions WHERE tenant_id = t.id) as total_chat_cost
      FROM yovo_tbl_aiva_tenants t
      WHERE t.id = ?
    `, [tenantId]);

    if (tenants.length === 0) {
      return null;
    }

    const tenant = tenants[0];

    // Get users for this tenant
    const [users] = await db.query(`
      SELECT id, name, email, role, is_active, last_login_at, created_at
      FROM yovo_tbl_aiva_users
      WHERE tenant_id = ?
      ORDER BY role, name
    `, [tenantId]);

    // Get agents for this tenant
    const [agents] = await db.query(`
      SELECT id, name, type, is_active as status, provider, created_at
      FROM yovo_tbl_aiva_agents
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [tenantId]);

    return {
      ...tenant,
      api_key_masked: tenant.api_key ? `${tenant.api_key.substring(0, 7)}...${tenant.api_key.substring(tenant.api_key.length - 4)}` : null,
      users,
      agents
    };
  }

  /**
   * Create new tenant with admin user
   */
  static async createTenant(data) {
    const {
      name,
      company_name,
      admin_email,
      admin_password,
      admin_name,
      initial_credits = 0
    } = data;

    // Validate required fields
    if (!name || !admin_email || !admin_password || !admin_name) {
      throw new Error('Name, admin email, admin password, and admin name are required');
    }

    // Check if email already exists
    const [existingUsers] = await db.query(
      'SELECT id FROM yovo_tbl_aiva_users WHERE email = ?',
      [admin_email]
    );

    if (existingUsers.length > 0) {
      throw new Error('Email already exists');
    }

    const tenantId = uuidv4();
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(admin_password, 10);

    // Start transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Create tenant
      await connection.query(`
        INSERT INTO yovo_tbl_aiva_tenants (id, name, company_name, email, credit_balance, is_active)
        VALUES (?, ?, ?, ?, ?, TRUE)
      `, [tenantId, name, company_name || name, admin_email, initial_credits]);

      // Create admin user
      await connection.query(`
        INSERT INTO yovo_tbl_aiva_users (id, tenant_id, email, password_hash, name, role, is_active)
        VALUES (?, ?, ?, ?, ?, 'admin', TRUE)
      `, [userId, tenantId, admin_email, passwordHash, admin_name]);

      await connection.commit();

      return {
        tenant_id: tenantId,
        user_id: userId,
        name,
        company_name: company_name || name,
        admin_email,
        admin_name,
        credit_balance: initial_credits
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Update tenant
   */
  static async updateTenant(tenantId, data) {
    const allowedFields = ['name', 'company_name', 'is_active'];
    const updates = [];
    const params = [];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(data[field]);
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(tenantId);

    await db.query(
      `UPDATE yovo_tbl_aiva_tenants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    return this.getTenant(tenantId);
  }

  /**
   * Add credits to tenant
   */
  static async addCredits(tenantId, amount, adminId, note = '') {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Get current balance
      const [tenants] = await connection.query(
        'SELECT credit_balance FROM yovo_tbl_aiva_tenants WHERE id = ? FOR UPDATE',
        [tenantId]
      );

      if (tenants.length === 0) {
        throw new Error('Tenant not found');
      }

      const balanceBefore = parseFloat(tenants[0].credit_balance);
      const balanceAfter = balanceBefore + amount;

      // Update balance
      await connection.query(
        'UPDATE yovo_tbl_aiva_tenants SET credit_balance = ? WHERE id = ?',
        [balanceAfter, tenantId]
      );

      // Log transaction
      await connection.query(`
        INSERT INTO yovo_tbl_aiva_credit_transactions 
        (id, tenant_id, type, amount, balance_before, balance_after, admin_id, note, operation_type)
        VALUES (?, ?, 'add', ?, ?, ?, ?, ?, 'admin_credit_add')
      `, [uuidv4(), tenantId, amount, balanceBefore, balanceAfter, adminId, note]);

      await connection.commit();

      return {
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        amount_added: amount
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Deactivate tenant (soft delete)
   */
  static async deactivateTenant(tenantId) {
    await db.query(
      'UPDATE yovo_tbl_aiva_tenants SET is_active = FALSE, updated_at = NOW() WHERE id = ?',
      [tenantId]
    );

    // Also deactivate all users
    await db.query(
      'UPDATE yovo_tbl_aiva_users SET is_active = FALSE WHERE tenant_id = ?',
      [tenantId]
    );

    return { message: 'Tenant deactivated successfully' };
  }

  /**
   * Reactivate tenant
   */
  static async reactivateTenant(tenantId) {
    await db.query(
      'UPDATE yovo_tbl_aiva_tenants SET is_active = TRUE, updated_at = NOW() WHERE id = ?',
      [tenantId]
    );

    return { message: 'Tenant reactivated successfully' };
  }

  /**
   * Generate API key for tenant
   */
  static async generateApiKey(tenantId) {
    const apiKey = `ak_${uuidv4().replace(/-/g, '')}`;

    await db.query(
      'UPDATE yovo_tbl_aiva_tenants SET api_key = ? WHERE id = ?',
      [apiKey, tenantId]
    );

    return { api_key: apiKey };
  }

  /**
   * Revoke API key for tenant
   */
  static async revokeApiKey(tenantId) {
    await db.query(
      'UPDATE yovo_tbl_aiva_tenants SET api_key = NULL WHERE id = ?',
      [tenantId]
    );

    return { message: 'API key revoked' };
  }

  /**
   * Get tenant statistics summary
   */
  static async getStats() {
    const [stats] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM yovo_tbl_aiva_tenants) as total_tenants,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_tenants WHERE is_active = TRUE) as active_tenants,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_users) as total_users,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_agents) as total_agents,
        (SELECT SUM(credit_balance) FROM yovo_tbl_aiva_tenants) as total_credits,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_call_logs) as total_calls,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_chat_sessions) as total_chat_sessions
    `);

    return stats[0];
  }
}

module.exports = TenantService;