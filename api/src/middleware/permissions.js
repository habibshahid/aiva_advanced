const PERMISSIONS = {
    'super_admin': ['*'],
    'admin': [
        'agents.*',
        'functions.*',
        'credits.add',
        'credits.view',
        'users.manage',
        'calls.view'
    ],
    'agent_manager': [
        'agents.create',
        'agents.update',
        'agents.view',
        'functions.*'
    ],
    'client': [
        'calls.view_own',
        'credits.view_own'
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
                error: 'Insufficient permissions' 
            });
        }
        
        next();
    };
};

exports.requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions' 
            });
        }
        next();
    };
};