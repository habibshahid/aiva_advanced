/**
 * User Management Routes
 * Handles user CRUD operations
 */

const express = require('express');
const router = express.Router();
const UserService = require('../services/UserService');
const { verifyToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const ResponseBuilder = require('../utils/response-builder');

/**
 * @route GET /api/users
 * @desc List users in tenant
 * @access Private (admin, super_admin)
 */
router.get('/', verifyToken, checkPermission('users.view'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { role, is_active } = req.query;

    const users = await UserService.listUsers(req.user.tenant_id, {
      role,
      is_active: is_active !== undefined ? is_active === 'true' : undefined
    });

    res.json(rb.success({ users, count: users.length }));

  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/users/:user_id
 * @desc Get user details
 * @access Private
 */
router.get('/:user_id', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const user = await UserService.getUser(req.params.user_id);

    if (!user) {
      return res.status(404).json(
        ResponseBuilder.notFound('User')
      );
    }

    // Check permission: users can view themselves, admins can view all in tenant
    if (user.id !== req.user.id && 
        user.tenant_id !== req.user.tenant_id && 
        req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    res.json(rb.success(user));

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route POST /api/users
 * @desc Create new user
 * @access Private (admin, super_admin)
 */
router.post('/', verifyToken, checkPermission('users.create'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { email, password, name, role } = req.body;

    // Validation
    if (!email || !password || !name || !role) {
      return res.status(400).json(
        rb.badRequest('email, password, name, and role are required')
      );
    }

    // Only super_admin can create super_admin users
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json(
        rb.forbidden('Only super admins can create super admin users')
      );
    }

    // Only admin and super_admin can create admin users
    if (role === 'admin' && !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json(
        rb.forbidden('Insufficient permissions to create admin users')
      );
    }

    const user = await UserService.createUser({
      tenant_id: req.user.tenant_id,
      email,
      password,
      name,
      role
    });

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'user_created',
      resource_type: 'user',
      resource_id: user.id,
      details: { created_user_email: email, created_user_role: role },
      ip_address: req.ip
    });

    res.status(201).json(rb.success(user, 'User created successfully'));

  } catch (error) {
    console.error('Create user error:', error);
    
    if (error.message === 'Email already exists') {
      return res.status(409).json(
        ResponseBuilder.conflict(error.message)
      );
    }
    
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route PUT /api/users/:user_id
 * @desc Update user
 * @access Private
 */
router.put('/:user_id', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const user = await UserService.getUser(req.params.user_id);

    if (!user) {
      return res.status(404).json(
        ResponseBuilder.notFound('User')
      );
    }

    // Permission check
    const isSelf = user.id === req.user.id;
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isSameTenant = user.tenant_id === req.user.tenant_id;

    if (!isSelf && !isAdmin) {
      return res.status(403).json(
        ResponseBuilder.forbidden('You can only update your own profile')
      );
    }

    if (isAdmin && !isSameTenant && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    // Role update validation
    if (req.body.role && req.body.role !== user.role) {
      // Only admins can change roles
      if (!isAdmin) {
        return res.status(403).json(
          rb.forbidden('Only administrators can change user roles')
        );
      }

      // Only super_admin can create/modify super_admin
      if (req.body.role === 'super_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json(
          rb.forbidden('Only super admins can set super admin role')
        );
      }
    }

    const updated = await UserService.updateUser(req.params.user_id, req.body);

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'user_updated',
      resource_type: 'user',
      resource_id: user.id,
      details: { updated_fields: Object.keys(req.body) },
      ip_address: req.ip
    });

    res.json(rb.success(updated, 'User updated successfully'));

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route DELETE /api/users/:user_id
 * @desc Delete user
 * @access Private (admin, super_admin)
 */
router.delete('/:user_id', verifyToken, checkPermission('users.delete'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const user = await UserService.getUser(req.params.user_id);

    if (!user) {
      return res.status(404).json(
        ResponseBuilder.notFound('User')
      );
    }

    // Can't delete yourself
    if (user.id === req.user.id) {
      return res.status(400).json(
        rb.badRequest('You cannot delete your own account')
      );
    }

    // Check tenant permission
    if (user.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    // Only super_admin can delete super_admin users
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json(
        rb.forbidden('Only super admins can delete super admin users')
      );
    }

    await UserService.deleteUser(req.params.user_id);

    // Log action
    await UserService.logAction({
      user_id: req.user.id,
      tenant_id: req.user.tenant_id,
      action: 'user_deleted',
      resource_type: 'user',
      resource_id: user.id,
      details: { deleted_user_email: user.email },
      ip_address: req.ip
    });

    res.json(rb.success(null, 'User deleted successfully'));

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/users/:user_id/audit-log
 * @desc Get user audit log
 * @access Private
 */
router.get('/:user_id/audit-log', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const user = await UserService.getUser(req.params.user_id);

    if (!user) {
      return res.status(404).json(
        ResponseBuilder.notFound('User')
      );
    }

    // Permission check
    const isSelf = user.id === req.user.id;
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);

    if (!isSelf && !isAdmin) {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    const logs = await UserService.getAuditLog(req.params.user_id, {
      limit: parseInt(req.query.limit) || 100,
      action: req.query.action,
      resource_type: req.query.resource_type
    });

    res.json(rb.success({ logs, count: logs.length }));

  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

module.exports = router;