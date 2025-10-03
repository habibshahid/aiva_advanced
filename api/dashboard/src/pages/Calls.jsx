import React, { useEffect, useState } from 'react';
import { Phone, Clock, DollarSign } from 'lucide-react';
import { getCalls, getCall } from '../services/api';
import toast from 'react-hot-toast';

const Calls = () => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState(null);

  useEffect(() => {
    loadCalls();
  }, []);

  const loadCalls = async () => {
    try {
      const response = await getCalls({ limit: 50 });
      setCalls(response.data.calls);
    } catch (error) {
      toast.error('Failed to load calls');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (call) => {
    try {
      const response = await getCall(call.session_id);
      setSelectedCall(response.data.call);
    } catch (error) {
      toast.error('Failed to load call details');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Call Logs</h1>
        <p className="mt-1 text-sm text-gray-500">View and analyze call history</p>
      </div>

      <div className="bg-white shadow overflow-hidden rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Caller
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Agent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cost
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {calls.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500">
                  No calls yet
                </td>
              </tr>
            ) : (
              calls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(call.start_time).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {call.caller_id || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {call.agent_name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {call.duration_seconds ? `${call.duration_seconds}s` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${call.final_cost?.toFixed(4) || '0.0000'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        call.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : call.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : call.status === 'insufficient_credits'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {call.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleViewDetails(call)}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Call Details Modal */}
      {selectedCall && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setSelectedCall(null)} />
            <div className="relative bg-white rounded-lg max-w-3xl w-full p-6 max-h-screen overflow-y-auto">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Call Details</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Session ID</p>
                    <p className="text-sm text-gray-900">{selectedCall.session_id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Caller</p>
                    <p className="text-sm text-gray-900">{selectedCall.caller_id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Duration</p>
                    <p className="text-sm text-gray-900">{selectedCall.duration_seconds}s</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Final Cost</p>
                    <p className="text-sm text-gray-900">${selectedCall.final_cost?.toFixed(4)}</p>
                  </div>
                </div>

                {selectedCall.function_calls && selectedCall.function_calls.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Function Calls</h4>
                    <ul className="space-y-2">
                      {selectedCall.function_calls.map((fc, idx) => (
                        <li key={idx} className="border rounded p-3 text-sm">
                          <p className="font-medium">{fc.function_name}</p>
                          <p className="text-gray-600 mt-1">
                            Status: {fc.status} | Time: {fc.execution_time_ms}ms
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedCall(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calls;