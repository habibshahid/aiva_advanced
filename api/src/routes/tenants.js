/**
 * Tenant Management Routes
 * For service provider (super_admin) to manage tenants
 * File: api/src/routes/tenants.js
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const TenantService = require('../services/TenantService');
const UserService = require('../services/UserService');
const { verifyToken } = require('../middleware/auth');
const ResponseBuilder = require('../utils/response-builder');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware to ensure only super_admin can access these routes
 */
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json(
      ResponseBuilder.forbidden('Only super administrators can access tenant management')
    );
  }
  next();
};

/**
 * @route GET /api/tenants
 * @desc List all tenants
 * @access Private (super_admin only)
 */
router.get('/', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { search, is_active, limit, offset, sort_by, sort_order } = req.query;

    const result = await TenantService.listTenants({
      search,
      is_active: is_active !== undefined ? is_active === 'true' : undefined,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      sort_by,
      sort_order
    });

    res.json(rb.success(result));

  } catch (error) {
    console.error('List tenants error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/tenants/stats
 * @desc Get tenant statistics summary
 * @access Private (super_admin only)
 */
router.get('/stats', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const stats = await TenantService.getStats();
    res.json(rb.success(stats));

  } catch (error) {
    console.error('Get tenant stats error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/tenants/:id
 * @desc Get single tenant details
 * @access Private (super_admin only)
 */
router.get('/:id', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const tenant = await TenantService.getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json(ResponseBuilder.notFound('Tenant'));
    }

    res.json(rb.success(tenant));

  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/tenants
 * @desc Create new tenant with admin user
 * @access Private (super_admin only)
 */
router.post('/', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { name, company_name, admin_email, admin_password, admin_name, initial_credits } = req.body;

    // Validation
    if (!name || !admin_email || !admin_password || !admin_name) {
      return res.status(400).json(
        rb.badRequest('name, admin_email, admin_password, and admin_name are required')
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(admin_email)) {
      return res.status(400).json(rb.badRequest('Invalid email format'));
    }

    // Password length validation
    if (admin_password.length < 8) {
      return res.status(400).json(rb.badRequest('Password must be at least 8 characters'));
    }

    const result = await TenantService.createTenant({
      name,
      company_name,
      admin_email,
      admin_password,
      admin_name,
      initial_credits: parseFloat(initial_credits) || 0
    });

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'tenant_created',
      resource_type: 'tenant',
      resource_id: result.tenant_id,
      details: { 
        tenant_name: name, 
        admin_email,
        initial_credits: parseFloat(initial_credits) || 0
      },
      ip_address: req.ip
    });

    res.status(201).json(rb.success(result, 'Tenant created successfully'));

  } catch (error) {
    console.error('Create tenant error:', error);
    
    if (error.message === 'Email already exists') {
      return res.status(409).json(ResponseBuilder.conflict(error.message));
    }
    
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route PUT /api/tenants/:id
 * @desc Update tenant
 * @access Private (super_admin only)
 */
router.put('/:id', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const tenant = await TenantService.getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json(ResponseBuilder.notFound('Tenant'));
    }

    const updated = await TenantService.updateTenant(req.params.id, req.body);

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'tenant_updated',
      resource_type: 'tenant',
      resource_id: req.params.id,
      details: { updated_fields: Object.keys(req.body) },
      ip_address: req.ip
    });

    res.json(rb.success(updated, 'Tenant updated successfully'));

  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/tenants/:id/credits
 * @desc Add credits to tenant
 * @access Private (super_admin only)
 */
router.post('/:id/credits', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { amount, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json(rb.badRequest('Amount must be a positive number'));
    }

    const tenant = await TenantService.getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json(ResponseBuilder.notFound('Tenant'));
    }

    const result = await TenantService.addCredits(
      req.params.id,
      parseFloat(amount),
      req.user.id,
      note
    );

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'tenant_credits_added',
      resource_type: 'tenant',
      resource_id: req.params.id,
      details: { 
        amount, 
        note,
        balance_before: result.balance_before,
        balance_after: result.balance_after
      },
      ip_address: req.ip
    });

    res.json(rb.success(result, 'Credits added successfully'));

  } catch (error) {
    console.error('Add credits error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/tenants/:id/deactivate
 * @desc Deactivate tenant (soft delete)
 * @access Private (super_admin only)
 */
router.post('/:id/deactivate', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const tenant = await TenantService.getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json(ResponseBuilder.notFound('Tenant'));
    }

    // Prevent deactivating own tenant
    if (req.params.id === req.user.tenant_id) {
      return res.status(400).json(rb.badRequest('Cannot deactivate your own tenant'));
    }

    const result = await TenantService.deactivateTenant(req.params.id);

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'tenant_deactivated',
      resource_type: 'tenant',
      resource_id: req.params.id,
      ip_address: req.ip
    });

    res.json(rb.success(result));

  } catch (error) {
    console.error('Deactivate tenant error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/tenants/:id/reactivate
 * @desc Reactivate tenant
 * @access Private (super_admin only)
 */
router.post('/:id/reactivate', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const tenant = await TenantService.getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json(ResponseBuilder.notFound('Tenant'));
    }

    const result = await TenantService.reactivateTenant(req.params.id);

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'tenant_reactivated',
      resource_type: 'tenant',
      resource_id: req.params.id,
      ip_address: req.ip
    });

    res.json(rb.success(result));

  } catch (error) {
    console.error('Reactivate tenant error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/tenants/:id/api-key
 * @desc Generate new API key for tenant
 * @access Private (super_admin only)
 */
router.post('/:id/api-key', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const tenant = await TenantService.getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json(ResponseBuilder.notFound('Tenant'));
    }

    const result = await TenantService.generateApiKey(req.params.id);

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'tenant_api_key_generated',
      resource_type: 'tenant',
      resource_id: req.params.id,
      ip_address: req.ip
    });

    res.json(rb.success(result, 'API key generated successfully'));

  } catch (error) {
    console.error('Generate API key error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route DELETE /api/tenants/:id/api-key
 * @desc Revoke API key for tenant
 * @access Private (super_admin only)
 */
router.delete('/:id/api-key', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const tenant = await TenantService.getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json(ResponseBuilder.notFound('Tenant'));
    }

    const result = await TenantService.revokeApiKey(req.params.id);

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'tenant_api_key_revoked',
      resource_type: 'tenant',
      resource_id: req.params.id,
      ip_address: req.ip
    });

    res.json(rb.success(result, 'API key revoked successfully'));

  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/tenants/:id/emulate
 * @desc Generate emulation token to login as tenant admin
 * @access Private (super_admin only)
 */
router.post('/:id/emulate', verifyToken, requireSuperAdmin, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const tenant = await TenantService.getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json(ResponseBuilder.notFound('Tenant'));
    }

    if (!tenant.is_active) {
      return res.status(400).json(rb.badRequest('Cannot emulate inactive tenant'));
    }

    // Find the admin user for this tenant
    const adminUser = tenant.users.find(u => u.role === 'admin' && u.is_active);

    if (!adminUser) {
      return res.status(400).json(rb.badRequest('No active admin user found for this tenant'));
    }

    // Generate emulation token (valid for 1 hour)
    const emulationToken = jwt.sign(
      {
        id: adminUser.id,
        email: adminUser.email,
        role: 'admin', // Always admin, never super_admin
        tenant_id: tenant.id,
        // Emulation metadata
        is_emulation: true,
        emulated_by: req.user.id,
        original_tenant_id: req.user.tenant_id,
        emulation_started_at: new Date().toISOString()
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'tenant_emulation_started',
      resource_type: 'tenant',
      resource_id: req.params.id,
      details: {
        emulated_tenant_name: tenant.name,
        emulated_user_email: adminUser.email
      },
      ip_address: req.ip
    });

    res.json(rb.success({
      token: emulationToken,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        company_name: tenant.company_name
      },
      user: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: 'admin'
      },
      expires_in: '1 hour',
      note: 'Use this token in Authorization header. Remember to exit emulation when done.'
    }));

  } catch (error) {
    console.error('Emulate tenant error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

module.exports = router;