const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class CallService {
    // Create call log
    async createCallLog(sessionId, tenantId, agentId, callerId, asteriskPort) {
        const callLogId = uuidv4();
        
        await db.query(
            `INSERT INTO call_logs (
                id, session_id, tenant_id, agent_id, caller_id,
                asterisk_port, start_time, status
            ) VALUES (?, ?, ?, ?, ?, ?, NOW(), 'in_progress')`,
            [callLogId, sessionId, tenantId, agentId, callerId, asteriskPort]
        );
        
        return callLogId;
    }
    
    // Update call log
    async updateCallLog(sessionId, updates) {
        const fields = [];
        const values = [];
        
        const allowedFields = [
            'end_time', 'duration_seconds', 'audio_input_seconds',
            'audio_output_seconds', 'text_input_tokens', 'text_output_tokens',
            'cached_tokens', 'base_cost', 'profit_amount', 'final_cost', 'status'
        ];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(updates[field]);
            }
        }
        
        if (fields.length === 0) {
            return;
        }
        
        values.push(sessionId);
        
        await db.query(
            `UPDATE call_logs SET ${fields.join(', ')} WHERE session_id = ?`,
            values
        );
    }
    
    // Log function call
    async logFunctionCall(callLogId, functionName, args, result, executionTimeMs, status, errorMessage = null) {
        const logId = uuidv4();
        
        await db.query(
            `INSERT INTO function_call_logs (
                id, call_log_id, function_name, arguments, result,
                execution_time_ms, status, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                logId,
                callLogId,
                functionName,
                JSON.stringify(args),
                JSON.stringify(result),
                executionTimeMs,
                status,
                errorMessage
            ]
        );
    }
    
    // Get call log
    async getCallLog(sessionId) {
        const [calls] = await db.query(
            `SELECT 
                cl.*,
                a.name as agent_name,
                t.name as tenant_name
            FROM call_logs cl
            LEFT JOIN agents a ON cl.agent_id = a.id
            LEFT JOIN tenants t ON cl.tenant_id = t.id
            WHERE cl.session_id = ?`,
            [sessionId]
        );
        
        if (calls.length === 0) {
            return null;
        }
        
        const call = calls[0];
        
        // Get function calls
        const [functions] = await db.query(
            'SELECT * FROM function_call_logs WHERE call_log_id = ? ORDER BY created_at',
            [call.id]
        );
        
        call.function_calls = functions.map(f => ({
            ...f,
            arguments: JSON.parse(f.arguments),
            result: JSON.parse(f.result)
        }));
        
        return call;
    }
    
    // List calls
    async listCalls(tenantId, filters = {}, limit = 50, offset = 0) {
        let query = `
            SELECT 
                cl.*,
                a.name as agent_name
            FROM call_logs cl
            LEFT JOIN agents a ON cl.agent_id = a.id
            WHERE cl.tenant_id = ?
        `;
        const params = [tenantId];
        
        if (filters.status) {
            query += ' AND cl.status = ?';
            params.push(filters.status);
        }
        
        if (filters.agent_id) {
            query += ' AND cl.agent_id = ?';
            params.push(filters.agent_id);
        }
        
        if (filters.start_date) {
            query += ' AND cl.start_time >= ?';
            params.push(filters.start_date);
        }
        
        if (filters.end_date) {
            query += ' AND cl.start_time <= ?';
            params.push(filters.end_date);
        }
        
        query += ' ORDER BY cl.start_time DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const [calls] = await db.query(query, params);
        
        return calls.map(c => ({
            ...c,
            base_cost: parseFloat(c.base_cost || 0),
            profit_amount: parseFloat(c.profit_amount || 0),
            final_cost: parseFloat(c.final_cost || 0)
        }));
    }
    
    // Get call statistics
    async getCallStats(tenantId, days = 30) {
        const [stats] = await db.query(
            `SELECT 
                COUNT(*) as total_calls,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_calls,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_calls,
                AVG(duration_seconds) as avg_duration,
                SUM(final_cost) as total_cost
            FROM call_logs
            WHERE tenant_id = ?
            AND start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [tenantId, days]
        );
        
        return {
            total_calls: stats[0].total_calls || 0,
            completed_calls: stats[0].completed_calls || 0,
            failed_calls: stats[0].failed_calls || 0,
            avg_duration: stats[0].avg_duration || 0,
            total_cost: parseFloat(stats[0].total_cost || 0),
            period_days: days
        };
    }
}

module.exports = new CallService();