const db = require('../config/database');
const redisClient = require('../config/redis');
const { v4: uuidv4 } = require('uuid');

class CreditService {
    // Get balance
    async getBalance(tenantId) {
        // Try cache first
        const cached = await redisClient.get(`balance:${tenantId}`);
        if (cached) {
            return parseFloat(cached);
        }
        
        const [tenants] = await db.query(
            'SELECT credit_balance FROM tenants WHERE id = ?',
            [tenantId]
        );
        
        if (tenants.length === 0) {
            throw new Error('Tenant not found');
        }
        
        const balance = parseFloat(tenants[0].credit_balance);
        
        // Cache it
        await redisClient.setEx(`balance:${tenantId}`, 60, balance.toString());
        
        return balance;
    }
    
    // Check if tenant has sufficient credits
    async hasSufficientCredits(tenantId, requiredAmount = 0.10) {
        const balance = await this.getBalance(tenantId);
        return balance >= requiredAmount;
    }
    
    // Add credits
    async addCredits(tenantId, amount, adminId, note = null) {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Get current balance
            const [tenants] = await connection.query(
                'SELECT credit_balance FROM tenants WHERE id = ? FOR UPDATE',
                [tenantId]
            );
            
            if (tenants.length === 0) {
                throw new Error('Tenant not found');
            }
            
            const balanceBefore = parseFloat(tenants[0].credit_balance);
            const balanceAfter = balanceBefore + amount;
            
            // Update balance
            await connection.query(
                'UPDATE tenants SET credit_balance = ? WHERE id = ?',
                [balanceAfter, tenantId]
            );
            
            // Record transaction
            const transactionId = uuidv4();
            await connection.query(
                `INSERT INTO credit_transactions (
                    id, tenant_id, type, amount, balance_before, 
                    balance_after, reference_type, admin_id, note
                ) VALUES (?, ?, 'add', ?, ?, ?, 'manual_topup', ?, ?)`,
                [transactionId, tenantId, amount, balanceBefore, balanceAfter, adminId, note]
            );
            
            await connection.commit();
            
            // Update cache
            await redisClient.setEx(`balance:${tenantId}`, 60, balanceAfter.toString());
            
            return {
                transaction_id: transactionId,
                balance_before: balanceBefore,
                balance_after: balanceAfter,
                amount: amount
            };
            
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
    
    // Deduct credits (for call costs)
    async deductCredits(tenantId, amount, callLogId) {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Get current balance
            const [tenants] = await connection.query(
                'SELECT credit_balance FROM tenants WHERE id = ? FOR UPDATE',
                [tenantId]
            );
            
            if (tenants.length === 0) {
                throw new Error('Tenant not found');
            }
            
            const balanceBefore = parseFloat(tenants[0].credit_balance);
            const balanceAfter = balanceBefore - amount;
            
            if (balanceAfter < 0) {
                throw new Error('Insufficient credits');
            }
            
            // Update balance
            await connection.query(
                'UPDATE tenants SET credit_balance = ? WHERE id = ?',
                [balanceAfter, tenantId]
            );
            
            // Record transaction
            const transactionId = uuidv4();
            await connection.query(
                `INSERT INTO credit_transactions (
                    id, tenant_id, type, amount, balance_before, 
                    balance_after, reference_type, reference_id
                ) VALUES (?, ?, 'deduct', ?, ?, ?, 'call', ?)`,
                [transactionId, tenantId, amount, balanceBefore, balanceAfter, callLogId]
            );
            
            await connection.commit();
            
            // Update cache
            await redisClient.setEx(`balance:${tenantId}`, 60, balanceAfter.toString());
            
            return {
                transaction_id: transactionId,
                balance_after: balanceAfter
            };
            
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
    
    // Get transaction history
    async getTransactions(tenantId, limit = 50, offset = 0) {
        const [transactions] = await db.query(
            `SELECT 
                ct.*,
                t.name as admin_name
            FROM credit_transactions ct
            LEFT JOIN tenants t ON ct.admin_id = t.id
            WHERE ct.tenant_id = ?
            ORDER BY ct.created_at DESC
            LIMIT ? OFFSET ?`,
            [tenantId, limit, offset]
        );
        
        return transactions.map(t => ({
            ...t,
            amount: parseFloat(t.amount),
            balance_before: parseFloat(t.balance_before),
            balance_after: parseFloat(t.balance_after)
        }));
    }
    
    // Get usage statistics
    async getUsageStats(tenantId, days = 30) {
        const [stats] = await db.query(
            `SELECT 
                COUNT(*) as total_calls,
                SUM(final_cost) as total_cost,
                AVG(final_cost) as avg_cost_per_call,
                SUM(duration_seconds) as total_duration_seconds
            FROM call_logs
            WHERE tenant_id = ? 
            AND start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
            AND status = 'completed'`,
            [tenantId, days]
        );
        
        return {
            total_calls: stats[0].total_calls || 0,
            total_cost: parseFloat(stats[0].total_cost || 0),
            avg_cost_per_call: parseFloat(stats[0].avg_cost_per_call || 0),
            total_duration_seconds: stats[0].total_duration_seconds || 0,
            period_days: days
        };
    }
}

module.exports = new CreditService();