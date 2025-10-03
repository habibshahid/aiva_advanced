import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, DollarSign, Phone, TrendingUp } from 'lucide-react';
import { getBalance, getCallStats, getAgents } from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Dashboard = () => {
  const [stats, setStats] = useState({
    balance: 0,
    agents: 0,
    calls: 0,
    totalCost: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [balanceRes, callStatsRes, agentsRes] = await Promise.all([
        getBalance(),
        getCallStats(30),
        getAgents({ is_active: true })
      ]);

      setStats({
        balance: balanceRes.data.balance,
        agents: agentsRes.data.agents.length,
        calls: callStatsRes.data.total_calls,
        totalCost: callStatsRes.data.total_cost
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      name: 'Credit Balance',
      value: `$${stats.balance.toFixed(2)}`,
      icon: DollarSign,
      color: 'bg-green-500',
      link: '/credits'
    },
    {
      name: 'Active Agents',
      value: stats.agents,
      icon: Bot,
      color: 'bg-blue-500',
      link: '/agents'
    },
    {
      name: 'Total Calls (30d)',
      value: stats.calls,
      icon: Phone,
      color: 'bg-purple-500',
      link: '/calls'
    },
    {
      name: 'Total Cost (30d)',
      value: `$${stats.totalCost.toFixed(2)}`,
      icon: TrendingUp,
      color: 'bg-orange-500',
      link: '/calls'
    }
  ];

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
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your agent management system</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.name}
              to={stat.link}
              className="overflow-hidden bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-center">
                  <div className={`flex-shrink-0 p-3 rounded-md ${stat.color}`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 ml-5">
                    <p className="text-sm font-medium text-gray-500 truncate">{stat.name}</p>
                    <p className="mt-1 text-2xl font-semibold text-gray-900">{stat.value}</p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to="/agents/new"
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 transition-colors text-center"
          >
            <Bot className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-900">Create New Agent</span>
          </Link>
          <Link
            to="/credits"
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 transition-colors text-center"
          >
            <DollarSign className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-900">Manage Credits</span>
          </Link>
          <Link
            to="/calls"
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 transition-colors text-center"
          >
            <Phone className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-900">View Call Logs</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;