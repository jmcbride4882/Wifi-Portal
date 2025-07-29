import { Routes, Route, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import CaptivePortal from './pages/CaptivePortal'
import StaffPortal from './pages/StaffPortal'
import AdminDashboard from './pages/AdminDashboard'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AnimatePresence mode="wait">
        <Routes>
          {/* Captive Portal - Default route */}
          <Route 
            path="/" 
            element={
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CaptivePortal />
              </motion.div>
            } 
          />
          
          {/* Portal route - same as default */}
          <Route 
            path="/portal" 
            element={
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CaptivePortal />
              </motion.div>
            } 
          />
          
          {/* Staff Portal */}
          <Route 
            path="/staff" 
            element={
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <StaffPortal />
              </motion.div>
            } 
          />
          
          {/* Admin Dashboard */}
          <Route 
            path="/admin/*" 
            element={
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <AdminDashboard />
              </motion.div>
            } 
          />
          
          {/* Catch all - redirect to captive portal */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </div>
  )
}

export default App