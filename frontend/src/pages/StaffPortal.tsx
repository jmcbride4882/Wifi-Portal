import { useState } from 'react'
import { motion } from 'framer-motion'
import { QrCode, Scan, Wifi, Receipt } from 'lucide-react'

export default function StaffPortal() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [currentView, setCurrentView] = useState<'login' | 'dashboard' | 'scan'>('login')

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen staff-portal-bg flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Staff Portal</h1>
            <p className="text-gray-600 mt-2">Enter your credentials to continue</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); setIsLoggedIn(true); setCurrentView('dashboard') }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                placeholder="staff@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
              <input
                type="password"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                placeholder="Enter your PIN"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-pink-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-pink-700 transition-colors"
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
      <div className="bg-pink-600 text-white p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Staff Portal</h1>
          <button
            onClick={() => setIsLoggedIn(false)}
            className="text-pink-200 hover:text-white"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <QrCode className="h-8 w-8 text-blue-600 mb-4" />
            <h3 className="font-semibold text-gray-900">Voucher Scanner</h3>
            <p className="text-gray-600 text-sm">Scan and redeem customer vouchers</p>
            <button
              onClick={() => setCurrentView('scan')}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
            >
              Open Scanner
            </button>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <Wifi className="h-8 w-8 text-green-600 mb-4" />
            <h3 className="font-semibold text-gray-900">Staff WiFi</h3>
            <p className="text-gray-600 text-sm">Get your daily staff WiFi access</p>
            <button className="mt-4 bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700">
              Generate Voucher
            </button>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <Receipt className="h-8 w-8 text-purple-600 mb-4" />
            <h3 className="font-semibold text-gray-900">Premium WiFi</h3>
            <p className="text-gray-600 text-sm">Issue premium WiFi vouchers</p>
            <button className="mt-4 bg-purple-600 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-700">
              Create Voucher
            </button>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <Scan className="h-8 w-8 text-orange-600 mb-4" />
            <h3 className="font-semibold text-gray-900">Receipt Scanner</h3>
            <p className="text-gray-600 text-sm">Scan receipts for premium access</p>
            <button className="mt-4 bg-orange-600 text-white px-4 py-2 rounded-md text-sm hover:bg-orange-700">
              Scan Receipt
            </button>
          </div>
        </div>

        {currentView === 'scan' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg p-6 shadow-sm"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Voucher Scanner</h2>
              <button
                onClick={() => setCurrentView('dashboard')}
                className="text-gray-600 hover:text-gray-800"
              >
                ✕ Close
              </button>
            </div>

            <div className="bg-gray-100 rounded-lg p-8 text-center">
              <QrCode className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">QR Code Scanner would be integrated here</p>
              <p className="text-gray-500 text-sm mt-2">
                This would use the device camera to scan voucher QR codes
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}