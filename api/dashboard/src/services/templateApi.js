/**
 * Template API Service
 */

import axios from 'axios';

const API_BASE = '/api/templates';

export const listTemplates = async (agentId, options = {}) => {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    
    const response = await axios.get(`${API_BASE}/${agentId}?${params}`);
    return response.data;
};

export const getTemplate = async (agentId, templateId) => {
    const response = await axios.get(`${API_BASE}/${agentId}/${templateId}`);
    return response.data;
};

export const getTemplateByKey = async (agentId, templateKey) => {
    const response = await axios.get(`${API_BASE}/${agentId}/key/${templateKey}`);
    return response.data;
};

export const createTemplate = async (agentId, data) => {
    const response = await axios.post(`${API_BASE}/${agentId}`, data);
    return response.data;
};

export const updateTemplate = async (agentId, templateId, data) => {
    const response = await axios.put(`${API_BASE}/${agentId}/${templateId}`, data);
    return response.data;
};

export const deleteTemplate = async (agentId, templateId) => {
    const response = await axios.delete(`${API_BASE}/${agentId}/${templateId}`);
    return response.data;
};

export const duplicateTemplate = async (agentId, templateId, newKey = null) => {
    const response = await axios.post(
        `${API_BASE}/${agentId}/${templateId}/duplicate`,
        { new_key: newKey }
    );
    return response.data;
};

export const previewTemplate = async (agentId, templateId, data) => {
    if (templateId) {
        const response = await axios.post(
            `${API_BASE}/${agentId}/${templateId}/preview`,
            data
        );
        return response.data;
    } else {
        // For new templates, use validate endpoint with structure
        const response = await axios.post(
            `${API_BASE}/${agentId}/validate`,
            { template_structure: data.template_structure }
        );
        return {
            success: true,
            data: {
                rendered_text: buildPreviewText(data.template_structure, data.variables)
            }
        };
    }
};

export const getResolvedTemplate = async (agentId, templateId, language = 'en') => {
    const response = await axios.get(
        `${API_BASE}/${agentId}/${templateId}/resolved?language=${language}`
    );
    return response.data;
};

export const validateTemplate = async (agentId, structure) => {
    const response = await axios.post(`${API_BASE}/${agentId}/validate`, {
        template_structure: structure
    });
    return response.data;
};

// Helper to build preview text locally
function buildPreviewText(structure, variables = {}) {
    if (!structure || !structure.parts) return '';
    
    return structure.parts.map(part => {
        if (part.type === 'segment') {
            return `[${part.segment_key || 'segment'}]`;
        } else if (part.type === 'variable') {
            return variables[part.name] || `{{${part.name}}}`;
        } else if (part.type === 'text') {
            return part.text || '';
        }
        return '';
    }).join(' ');
}
