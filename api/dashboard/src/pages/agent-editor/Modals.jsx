/**
 * Agent Editor Modal Components
 */

import React from 'react';
import { X, Play, Trash2 } from 'lucide-react';

// ============================================================================
// FUNCTION MODAL
// ============================================================================

export const FunctionModal = ({
  editingFunction, functionForm, setFunctionForm,
  headerForm, setHeaderForm, showHeaderForm, setShowHeaderForm, addHeader, removeHeader,
  handleBodyTypeChange, bodyRawJson, setBodyRawJson, bodyFormData, setBodyFormData,
  parameterJson, setParameterJson, showParameterJson, setShowParameterJson,
  parameterForm, setParameterForm, showParameterForm, setShowParameterForm,
  addParameter, removeParameter, updateParametersFromJson, loadExampleFunction,
  savingFunction, onSave, onClose
}) => (
  <div className="fixed inset-0 z-50 overflow-y-auto">
    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
      
      <div className="relative bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              {editingFunction ? 'Edit Function' : 'Add Function'}
            </h3>
            <div className="flex items-center space-x-2">
              {['checkBalance', 'bookAppointment', 'sendSMS', 'transferCall'].map(type => (
                <button
                  key={type}
                  onClick={() => loadExampleFunction(type)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  {type.replace(/([A-Z])/g, ' $1').trim()}
                </button>
              ))}
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Function Name *</label>
              <input
                type="text"
                value={functionForm.name}
                onChange={(e) => setFunctionForm({ ...functionForm, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono"
                placeholder="check_balance"
              />
            </div>
            
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <textarea
                value={functionForm.description}
                onChange={(e) => setFunctionForm({ ...functionForm, description: e.target.value })}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="What does this function do?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Execution Mode</label>
              <select
                value={functionForm.execution_mode}
                onChange={(e) => setFunctionForm({ ...functionForm, execution_mode: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="sync">Synchronous</option>
                <option value="async">Asynchronous</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Handler Type</label>
              <select
                value={functionForm.handler_type}
                onChange={(e) => setFunctionForm({ ...functionForm, handler_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="inline">Inline (Bridge)</option>
                <option value="api">External API</option>
              </select>
            </div>
          </div>

          {/* API Configuration */}
          {functionForm.handler_type === 'api' && (
            <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
              <h4 className="text-sm font-medium text-gray-900 mb-4">API Configuration</h4>
              
              {/* Method and Endpoint */}
              <div className="flex space-x-2 mb-4">
                <select
                  value={functionForm.api_method}
                  onChange={(e) => setFunctionForm({ ...functionForm, api_method: e.target.value })}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 font-semibold"
                >
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={functionForm.api_endpoint}
                  onChange={(e) => setFunctionForm({ ...functionForm, api_endpoint: e.target.value })}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                  placeholder="https://api.example.com/endpoint"
                />
              </div>
              <p className="text-xs text-gray-500 mb-4">Use {'{{parameter_name}}'} for dynamic values</p>

              {/* Headers */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Headers</label>
                  <button
                    type="button"
                    onClick={() => setShowHeaderForm(!showHeaderForm)}
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    {showHeaderForm ? 'Cancel' : '+ Add Header'}
                  </button>
                </div>
                
                {showHeaderForm && (
                  <div className="mb-3 p-3 border border-gray-300 rounded-lg bg-white">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={headerForm.key}
                        onChange={(e) => setHeaderForm({ ...headerForm, key: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                        placeholder="Authorization"
                      />
                      <input
                        type="text"
                        value={headerForm.value}
                        onChange={(e) => setHeaderForm({ ...headerForm, value: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                        placeholder="Bearer TOKEN"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addHeader}
                      className="mt-2 w-full px-3 py-1 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
                    >
                      Add Header
                    </button>
                  </div>
                )}

                {functionForm.api_headers.length > 0 && (
                  <div className="space-y-2">
                    {functionForm.api_headers.map((header, index) => (
                      <div key={index} className="flex items-center space-x-2 p-2 bg-white border border-gray-200 rounded">
                        <span className="text-sm font-mono text-gray-700 flex-1">
                          <span className="text-blue-600">{header.key}</span>: {header.value}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeHeader(index)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Body */}
              {['POST', 'PUT', 'PATCH'].includes(functionForm.api_method) && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Body</label>
                  
                  <div className="flex space-x-2 mb-3">
                    {['none', 'json', 'urlencoded', 'form-data'].map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleBodyTypeChange(type)}
                        className={`px-3 py-1 text-sm rounded ${
                          functionForm.api_body_type === type
                            ? 'bg-primary-600 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {type === 'none' ? 'None' : type === 'json' ? 'JSON' : type === 'urlencoded' ? 'URL Encoded' : 'Form Data'}
                      </button>
                    ))}
                  </div>

                  {functionForm.api_body_type === 'json' && (
                    <textarea
                      value={bodyRawJson}
                      onChange={(e) => setBodyRawJson(e.target.value)}
                      rows={6}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                      placeholder='{"key": "{{value}}"}'
                    />
                  )}
                </div>
              )}

              {/* Timeout and Retries */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Timeout (ms)</label>
                  <input
                    type="number"
                    value={functionForm.timeout_ms}
                    onChange={(e) => setFunctionForm({ ...functionForm, timeout_ms: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Retries</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={functionForm.retries}
                    onChange={(e) => setFunctionForm({ ...functionForm, retries: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={functionForm.skip_ssl_verify}
                      onChange={(e) => setFunctionForm({ ...functionForm, skip_ssl_verify: e.target.checked })}
                      className="mr-2"
                    />
                    Skip SSL
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Parameters */}
          <div className="border border-gray-300 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-gray-900">Parameters</h4>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setShowParameterJson(!showParameterJson)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  {showParameterJson ? 'Form View' : 'JSON View'}
                </button>
                {!showParameterJson && (
                  <button
                    type="button"
                    onClick={() => setShowParameterForm(!showParameterForm)}
                    className="text-xs px-2 py-1 bg-primary-100 text-primary-700 hover:bg-primary-200 rounded"
                  >
                    + Add Parameter
                  </button>
                )}
              </div>
            </div>

            {showParameterJson ? (
              <div>
                <textarea
                  value={parameterJson}
                  onChange={(e) => setParameterJson(e.target.value)}
                  rows={10}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={updateParametersFromJson}
                  className="mt-2 px-4 py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
                >
                  Apply JSON
                </button>
              </div>
            ) : (
              <>
                {showParameterForm && (
                  <div className="mb-4 p-3 border border-gray-300 rounded-lg bg-gray-50">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={parameterForm.name}
                        onChange={(e) => setParameterForm({ ...parameterForm, name: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                        placeholder="Parameter name"
                      />
                      <select
                        value={parameterForm.type}
                        onChange={(e) => setParameterForm({ ...parameterForm, type: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="array">Array</option>
                        <option value="object">Object</option>
                      </select>
                      <input
                        type="text"
                        value={parameterForm.description}
                        onChange={(e) => setParameterForm({ ...parameterForm, description: e.target.value })}
                        className="col-span-2 border border-gray-300 rounded px-2 py-1 text-sm"
                        placeholder="Description"
                      />
                      {parameterForm.type === 'string' && (
                        <input
                          type="text"
                          value={parameterForm.enum}
                          onChange={(e) => setParameterForm({ ...parameterForm, enum: e.target.value })}
                          className="col-span-2 border border-gray-300 rounded px-2 py-1 text-sm"
                          placeholder="Enum values (comma separated)"
                        />
                      )}
                      <label className="col-span-2 flex items-center text-sm">
                        <input
                          type="checkbox"
                          checked={parameterForm.required}
                          onChange={(e) => setParameterForm({ ...parameterForm, required: e.target.checked })}
                          className="mr-2"
                        />
                        Required
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={addParameter}
                      className="mt-3 w-full px-3 py-1 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
                    >
                      Add Parameter
                    </button>
                  </div>
                )}

                {Object.keys(functionForm.parameters.properties).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(functionForm.parameters.properties).map(([name, param]) => (
                      <div key={name} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                        <div>
                          <span className="font-mono text-sm text-gray-900">{name}</span>
                          <span className="ml-2 text-xs text-gray-500">({param.type})</span>
                          {functionForm.parameters.required?.includes(name) && (
                            <span className="ml-2 text-xs text-red-500">*required</span>
                          )}
                          {param.description && (
                            <p className="text-xs text-gray-500 mt-1">{param.description}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeParameter(name)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No parameters defined</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={savingFunction}
            className="px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            {savingFunction ? 'Saving...' : (editingFunction ? 'Update' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ============================================================================
// TEST FUNCTION MODAL
// ============================================================================

export const TestFunctionModal = ({
  testingFunction, testParameters, setTestParameters,
  testResult, isTestRunning, onTest, onClose
}) => (
  <div className="fixed inset-0 z-50 overflow-y-auto">
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
      
      <div className="relative bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Play className="w-5 h-5 mr-2 text-green-600" />
                Test: {testingFunction.name}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {testingFunction.api_method} {testingFunction.api_endpoint}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Parameters Input */}
          {testingFunction.parameters?.properties && 
           Object.keys(testingFunction.parameters.properties).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Test Parameters</h4>
              <div className="space-y-3">
                {Object.entries(testingFunction.parameters.properties).map(([key, param]) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {key}
                      {testingFunction.parameters.required?.includes(key) && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={testParameters[key] || ''}
                      onChange={(e) => setTestParameters({ ...testParameters, [key]: e.target.value })}
                      placeholder={param.description || `Enter ${key}`}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    {param.enum && (
                      <p className="mt-1 text-xs text-gray-500">
                        Allowed: {param.enum.join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!testingFunction.parameters?.properties || 
            Object.keys(testingFunction.parameters.properties).length === 0) && (
            <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-lg">
              No parameters required. Click "Run Test" to execute.
            </div>
          )}

          {/* Test Result */}
          {testResult && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Result</h4>
              
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mb-4 ${
                testResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {testResult.success ? '✓ Success' : '✗ Failed'}
                {testResult.test_result?.status_code && (
                  <span className="ml-2">(HTTP {testResult.test_result.status_code})</span>
                )}
                {testResult.test_result?.duration_ms && (
                  <span className="ml-2 text-gray-600">• {testResult.test_result.duration_ms}ms</span>
                )}
              </div>

              <div className={`rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-64 ${
                testResult.success ? 'bg-gray-800 text-green-400' : 'bg-red-900 text-red-100'
              }`}>
                {testResult.test_result?.error ? (
                  <div>
                    <div className="text-red-400 font-bold">Error: {testResult.test_result.error}</div>
                    {testResult.test_result.message && (
                      <div className="text-red-300 mt-1">{testResult.test_result.message}</div>
                    )}
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(testResult.test_result?.data, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={onTest}
            disabled={isTestRunning}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {isTestRunning ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Test
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ============================================================================
// AI INSTRUCTIONS MODAL
// ============================================================================

export const AIInstructionsModal = ({
  generatingAI, generatedInstructions, setGeneratedInstructions,
  aiCost, onAccept, onReject
}) => (
  <div className="fixed inset-0 z-50 overflow-y-auto">
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onReject} />
      
      <div className="relative bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <h3 className="text-lg font-semibold text-gray-900">✨ AI Generated Instructions</h3>
          <p className="text-sm text-gray-500 mt-1">Review and customize before applying</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {generatingAI ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4" />
              <p className="text-gray-600">Generating instructions...</p>
            </div>
          ) : (
            <>
              <textarea
                value={generatedInstructions}
                onChange={(e) => setGeneratedInstructions(e.target.value)}
                rows={20}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-mono text-sm focus:ring-2 focus:ring-primary-500"
              />
              
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Cost:</strong> ${aiCost?.toFixed(6) || '0.00'}
                </p>
                <ul className="mt-2 text-xs text-blue-700 list-disc list-inside">
                  <li>Review the generated instructions</li>
                  <li>Customize as needed before accepting</li>
                  <li>Test the agent after applying</li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!generatingAI && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
            <button
              onClick={onReject}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Discard
            </button>
            <button
              onClick={onAccept}
              className="px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
            >
              Accept & Apply
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
);