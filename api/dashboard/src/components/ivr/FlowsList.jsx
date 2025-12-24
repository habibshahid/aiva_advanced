/**
 * Flows List Component
 * Manage conversation flows
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Plus, Search, Edit2, Trash2, Copy, Play, Pause,
    GitBranch, RefreshCw, Loader2, MoreVertical,
    CheckCircle, XCircle, AlertCircle, Settings,
    BarChart2, MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as ivrApi from '../../services/ivrApi';

const FlowsList = () => {
    const { agentId } = useParams();
    const navigate = useNavigate();
    
    const [flows, setFlows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    
    useEffect(() => {
        loadFlows();
    }, [agentId, showInactive]);
    
    const loadFlows = async () => {
        try {
            setLoading(true);
            const result = await ivrApi.getFlows(agentId, showInactive);
            setFlows(result.data || []);
        } catch (error) {
            console.error('Failed to load flows:', error);
            toast.error('Failed to load flows');
        } finally {
            setLoading(false);
        }
    };
    
    const handleCreate = () => {
        navigate(`/agents/${agentId}/ivr/flows/new`);
    };
    
    const handleEdit = (flowId) => {
        navigate(`/agents/${agentId}/ivr/flows/${flowId}`);
    };
    
    const handleDuplicate = async (flowId) => {
        try {
            await ivrApi.duplicateFlow(agentId, flowId);
            toast.success('Flow duplicated');
            loadFlows();
        } catch (error) {
            toast.error('Failed to duplicate flow');
        }
    };
    
    const handleDelete = async (flowId) => {
        if (!window.confirm('Delete this flow? This cannot be undone.')) return;
        
        try {
            await ivrApi.deleteFlow(agentId, flowId);
            toast.success('Flow deleted');
            loadFlows();
        } catch (error) {
            toast.error('Failed to delete flow');
        }
    };
    
    const handleToggleActive = async (flow) => {
        try {
            await ivrApi.updateFlow(agentId, flow.id, { is_active: !flow.is_active });
            toast.success(flow.is_active ? 'Flow deactivated' : 'Flow activated');
            loadFlows();
        } catch (error) {
            toast.error('Failed to update flow');
        }
    };
    
    const filteredFlows = flows.filter(f =>
        !search ||
        f.flow_name.toLowerCase().includes(search.toLowerCase()) ||
        f.flow_key.toLowerCase().includes(search.toLowerCase()) ||
        f.description?.toLowerCase().includes(search.toLowerCase())
    );
    
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }
    
    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Conversation Flows</h1>
                    <p className="text-gray-600 mt-1">
                        Multi-turn conversation flows for collecting information
                    </p>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4" />
                    Create Flow
                </button>
            </div>
            
            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search flows..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                
                <label className="flex items-center gap-2 px-4 py-2 border rounded-lg bg-white">
                    <input
                        type="checkbox"
                        checked={showInactive}
                        onChange={(e) => setShowInactive(e.target.checked)}
                        className="rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Show inactive</span>
                </label>
                
                <button
                    onClick={loadFlows}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    title="Refresh"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard
                    label="Total Flows"
                    value={flows.length}
                    icon={GitBranch}
                    color="blue"
                />
                <StatCard
                    label="Active"
                    value={flows.filter(f => f.is_active).length}
                    icon={CheckCircle}
                    color="green"
                />
                <StatCard
                    label="Total Sessions"
                    value={flows.reduce((sum, f) => sum + (f.total_sessions || 0), 0)}
                    icon={MessageSquare}
                    color="purple"
                />
                <StatCard
                    label="Completion Rate"
                    value={calculateCompletionRate(flows) + '%'}
                    icon={BarChart2}
                    color="yellow"
                />
            </div>
            
            {/* Flows List */}
            {filteredFlows.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <GitBranch className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Flows Yet</h3>
                    <p className="text-gray-600 mb-4">
                        Create conversation flows to collect information from callers
                    </p>
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Create First Flow
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredFlows.map(flow => (
                        <FlowCard
                            key={flow.id}
                            flow={flow}
                            onEdit={() => handleEdit(flow.id)}
                            onDuplicate={() => handleDuplicate(flow.id)}
                            onDelete={() => handleDelete(flow.id)}
                            onToggleActive={() => handleToggleActive(flow)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color }) => {
    const colors = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        purple: 'bg-purple-50 text-purple-600',
        yellow: 'bg-yellow-50 text-yellow-600'
    };
    
    return (
        <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <div className="text-2xl font-bold text-gray-900">{value}</div>
                    <div className="text-sm text-gray-500">{label}</div>
                </div>
            </div>
        </div>
    );
};

// Flow Card Component
const FlowCard = ({ flow, onEdit, onDuplicate, onDelete, onToggleActive }) => {
    const [showMenu, setShowMenu] = useState(false);
    
    // Parse trigger phrases
    let triggers = flow.trigger_phrases;
    if (typeof triggers === 'string') {
        try {
            triggers = JSON.parse(triggers);
        } catch (e) {
            triggers = [];
        }
    }
    
    const completionRate = flow.total_sessions > 0
        ? Math.round((flow.completed_sessions / flow.total_sessions) * 100)
        : 0;
    
    return (
        <div className={`border rounded-lg bg-white overflow-hidden ${
            !flow.is_active ? 'opacity-60' : ''
        }`}>
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        flow.is_active ? 'bg-blue-50' : 'bg-gray-100'
                    }`}>
                        <GitBranch className={`w-6 h-6 ${
                            flow.is_active ? 'text-blue-600' : 'text-gray-400'
                        }`} />
                    </div>
                    
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">{flow.flow_name}</h3>
                            {flow.is_active ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                    Active
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                                    Inactive
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-500">
                            {flow.flow_key}
                            {flow.description && ` • ${flow.description}`}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-6">
                    {/* Stats */}
                    <div className="flex gap-6 text-sm">
                        <div className="text-center">
                            <div className="font-semibold text-gray-900">{flow.step_count || 0}</div>
                            <div className="text-gray-500">Steps</div>
                        </div>
                        <div className="text-center">
                            <div className="font-semibold text-gray-900">{flow.total_sessions || 0}</div>
                            <div className="text-gray-500">Sessions</div>
                        </div>
                        <div className="text-center">
                            <div className={`font-semibold ${
                                completionRate >= 70 ? 'text-green-600' :
                                completionRate >= 40 ? 'text-yellow-600' :
                                'text-red-600'
                            }`}>
                                {completionRate}%
                            </div>
                            <div className="text-gray-500">Complete</div>
                        </div>
                    </div>
                    
                    {/* Triggers Preview */}
                    <div className="hidden lg:block max-w-xs">
                        <div className="flex flex-wrap gap-1">
                            {(triggers || []).slice(0, 3).map((trigger, i) => (
                                <span
                                    key={i}
                                    className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded"
                                >
                                    {trigger}
                                </span>
                            ))}
                            {triggers?.length > 3 && (
                                <span className="text-xs text-gray-400">
                                    +{triggers.length - 3} more
                                </span>
                            )}
                        </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={onEdit}
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded"
                            title="Edit"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        
                        <div className="relative">
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className="p-2 text-gray-500 hover:bg-gray-100 rounded"
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>
                            
                            {showMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setShowMenu(false)}
                                    />
                                    <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-20">
                                        <button
                                            onClick={() => { onDuplicate(); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-left"
                                        >
                                            <Copy className="w-4 h-4" />
                                            Duplicate
                                        </button>
                                        <button
                                            onClick={() => { onToggleActive(); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-left"
                                        >
                                            {flow.is_active ? (
                                                <>
                                                    <XCircle className="w-4 h-4" />
                                                    Deactivate
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle className="w-4 h-4" />
                                                    Activate
                                                </>
                                            )}
                                        </button>
                                        <hr className="my-1" />
                                        <button
                                            onClick={() => { onDelete(); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-red-600 text-left"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Delete
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helper function
function calculateCompletionRate(flows) {
    const totalSessions = flows.reduce((sum, f) => sum + (f.total_sessions || 0), 0);
    const completedSessions = flows.reduce((sum, f) => sum + (f.completed_sessions || 0), 0);
    
    if (totalSessions === 0) return 0;
    return Math.round((completedSessions / totalSessions) * 100);
}

export default FlowsList;
