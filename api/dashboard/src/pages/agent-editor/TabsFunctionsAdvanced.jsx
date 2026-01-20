/**
 * Agent Editor Tab Components - Part 3: Functions
 */

import React from 'react';
import { Plus, Zap, Play, Edit2, Trash2 } from 'lucide-react';

// ============================================================================
// FUNCTIONS TAB
// ============================================================================

export const FunctionsTab = ({ functions, openFunctionModal, openTestModal, handleFunctionDelete }) => (
  <div className="space-y-6">
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Functions</h3>
        <button
          onClick={() => openFunctionModal()}
          className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Function
        </button>
      </div>
      
      <div className="p-6">
        {functions.length === 0 ? (
          <div className="text-center py-8">
            <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No functions defined yet.</p>
            <p className="text-sm text-gray-400 mt-1">Add functions to extend agent capabilities with external APIs.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {functions.map((func) => (
              <div key={func.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{func.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">{func.description}</p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                        {func.execution_mode}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                        {func.handler_type}
                      </span>
                      {func.api_endpoint && (
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                          {func.api_method}
                        </span>
                      )}
                    </div>
                    {func.api_endpoint && (
                      <div className="mt-2 text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded truncate">
                        {func.api_endpoint}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {func.handler_type === 'api' && (
                      <button
                        onClick={() => openTestModal(func)}
                        className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg"
                        title="Test function"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openFunctionModal(func)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Edit function"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleFunctionDelete(func.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete function"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);