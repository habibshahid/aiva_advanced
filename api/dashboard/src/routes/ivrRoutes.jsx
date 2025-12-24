/**
 * IVR Routes Configuration
 * Add these routes to your React Router configuration
 * 
 * Example usage in App.jsx or routes.jsx:
 * 
 * import { ivrRoutes } from './routes/ivrRoutes';
 * 
 * <Routes>
 *   {ivrRoutes}
 * </Routes>
 */

import React from 'react';
import { Route } from 'react-router-dom';

// IVR Components
import FlowsList from '../components/ivr/FlowsList';
import FlowBuilder from '../components/ivr/FlowBuilder';
import SegmentsList from '../components/ivr/SegmentsList';
import TemplatesList from '../components/ivr/TemplatesList';
import TemplateBuilder from '../components/ivr/TemplateBuilder';
import LanguageSettings from '../components/ivr/LanguageSettings';

/**
 * IVR Routes
 * Nest these under your agent routes
 */
export const ivrRoutes = (
    <>
        {/* Flows */}
        <Route path="agents/:agentId/ivr/flows" element={<FlowsList />} />
        <Route path="agents/:agentId/ivr/flows/new" element={<FlowBuilder />} />
        <Route path="agents/:agentId/ivr/flows/:flowId" element={<FlowBuilder />} />
        
        {/* Segments */}
        <Route path="agents/:agentId/ivr/segments" element={<SegmentsList />} />
        
        {/* Templates */}
        <Route path="agents/:agentId/ivr/templates" element={<TemplatesList />} />
        <Route path="agents/:agentId/ivr/templates/new" element={<TemplateBuilder />} />
        <Route path="agents/:agentId/ivr/templates/:templateId" element={<TemplateBuilder />} />
        
        {/* Languages */}
        <Route path="agents/:agentId/ivr/languages" element={<LanguageSettings />} />
    </>
);

/**
 * IVR Navigation Items
 * Add these to your sidebar or navigation
 */
export const ivrNavItems = [
    {
        label: 'Conversation Flows',
        path: 'ivr/flows',
        icon: 'GitBranch',
        description: 'Multi-turn conversation flows'
    },
    {
        label: 'Audio Segments',
        path: 'ivr/segments',
        icon: 'Volume2',
        description: 'Reusable audio segments'
    },
    {
        label: 'Audio Templates',
        path: 'ivr/templates',
        icon: 'FileText',
        description: 'Dynamic audio templates'
    },
    {
        label: 'Languages',
        path: 'ivr/languages',
        icon: 'Globe',
        description: 'Multi-language settings'
    }
];

/**
 * IVR Breadcrumb Configuration
 */
export const ivrBreadcrumbs = {
    'ivr/flows': 'Conversation Flows',
    'ivr/flows/new': 'Create Flow',
    'ivr/segments': 'Audio Segments',
    'ivr/templates': 'Audio Templates',
    'ivr/templates/new': 'Create Template',
    'ivr/languages': 'Languages'
};

export default ivrRoutes;
