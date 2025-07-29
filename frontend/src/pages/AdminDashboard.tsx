import { useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Users, Wifi, Settings, Shield } from 'lucide-react'

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen admin-portal-bg flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Admin Portal</h1>
            <p className="text-gray-600 mt-2">Administrative access required</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); setIsLoggedIn(true) }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
              <input
                type="password"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Admin PIN"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Sign In
            </button>
          </form>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-600 text-white p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">LSLT Portal - Admin Dashboard</h1>
          <button
            onClick={() => setIsLoggedIn(false)}
            className="text-blue-200 hover:text-white"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Active Users</p>
                <p className="text-2xl font-bold text-gray-900">1,234</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Vouchers Redeemed</p>
                <p className="text-2xl font-bold text-gray-900">856</p>
              </div>
              <BarChart3 className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">WiFi Sessions</p>
                <p className="text-2xl font-bold text-gray-900">2,543</p>
              </div>
              <Wifi className="h-8 w-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Blocked Devices</p>
                <p className="text-2xl font-bold text-gray-900">12</p>
              </div>
              <Shield className="h-8 w-8 text-red-600" />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <Settings className="h-8 w-8 text-blue-600 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Site Configuration</h3>
            <p className="text-gray-600 text-sm mb-4">Manage branding, WiFi settings, and site details</p>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">
              Configure
            </button>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <Users className="h-8 w-8 text-green-600 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">User Management</h3>
            <p className="text-gray-600 text-sm mb-4">View and manage customer accounts and loyalty</p>
            <button className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700">
              Manage Users
            </button>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <BarChart3 className="h-8 w-8 text-purple-600 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Analytics & Reports</h3>
            <p className="text-gray-600 text-sm mb-4">View detailed analytics and export reports</p>
            <button className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-700">
              View Reports
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-gray-900">New user registration</p>
                  <p className="text-sm text-gray-600">john.doe@email.com joined as Bronze member</p>
                </div>
                <span className="text-sm text-gray-500">2 minutes ago</span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-gray-900">Voucher redeemed</p>
                  <p className="text-sm text-gray-600">Free drink voucher used by Silver member</p>
                </div>
                <span className="text-sm text-gray-500">5 minutes ago</span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-gray-900">Device blocked</p>
                  <p className="text-sm text-gray-600">Device 00:11:22:33:44:55 blocked for policy violation</p>
                </div>
                <span className="text-sm text-gray-500">10 minutes ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}