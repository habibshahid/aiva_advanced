const PERMISSIONS = {
    'super_admin': ['*'],
    'admin': [
        'agents.*',
        'functions.*',
        'credits.add',
        'credits.view',
        'users.*', // Full user management
        'calls.view',
        'knowledge.*',
        'shopify.*'
    ],
    'agent_manager': [
        'agents.create',
        'agents.update',
        'agents.view',
		'agents.manage',
        'agents.delete',
        'functions.*',
        'calls.view',
        'knowledge.view',
        'users.view' // Can only view users
    ],
    'client': [
        'calls.view_own',
        'credits.view_own',
        'agents.view',
        'knowledge.view'
    ]
};

exports.checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        const userRole = req.user.role;
        const userPermissions = PERMISSIONS[userRole] || [];
        
        // Super admin has all permissions
        if (userPermissions.includes('*')) {
            return next();
        }
        
        // Check specific permission
        const hasPermission = userPermissions.some(perm => {
            if (perm === requiredPermission) return true;
            
            // Check wildcard permissions (e.g., 'agents.*')
            const [resource, action] = requiredPermission.split('.');
            const permPattern = `${resource}.*`;
            return perm === permPattern;
        });
        
        if (!hasPermission) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                required: requiredPermission,
                role: userRole
            });
        }
        
        next();
    };
};

exports.requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                required_roles: roles,
                current_role: req.user.role
            });
        }
        next();
    };
};

// Helper to check if user has permission (for use in code)
exports.hasPermission = (userRole, permission) => {
    const userPermissions = PERMISSIONS[userRole] || [];
    
    if (userPermissions.includes('*')) {
        return true;
    }
    
    return userPermissions.some(perm => {
        if (perm === permission) return true;
        
        const [resource, action] = permission.split('.');
        const permPattern = `${resource}.*`;
        return perm === permPattern;
    });
};