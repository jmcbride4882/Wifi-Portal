import { useState } from 'react'
import { motion } from 'framer-motion'
import { Wifi, Globe, Shield, Users } from 'lucide-react'
import { toast } from 'react-hot-toast'

export default function CaptivePortal() {
  const [language, setLanguage] = useState<'en' | 'es'>('en')
  const [currentStep, setCurrentStep] = useState<'welcome' | 'signup' | 'login' | 'success'>('welcome')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    dateOfBirth: '',
    marketingConsent: false
  })

  const texts = {
    en: {
      welcome: 'Welcome to Free WiFi',
      subtitle: 'Get connected in seconds',
      getStarted: 'Get Started',
      existingUser: 'Returning Customer?',
      signup: 'Sign Up for WiFi',
      login: 'Customer Login',
      name: 'Full Name',
      email: 'Email Address',
      dateOfBirth: 'Date of Birth',
      marketingConsent: 'I would like to receive special offers and updates',
      termsAccept: 'I accept the Terms of Service and Privacy Policy',
      createAccount: 'Create Account & Connect',
      loginButton: 'Login & Connect',
      backToWelcome: 'Back',
      success: 'You\'re Connected!',
      loyaltyProgress: 'Your loyalty progress',
      dataRemaining: 'Data remaining',
      enjoyWifi: 'Enjoy your free WiFi access'
    },
    es: {
      welcome: 'Bienvenido a WiFi Gratis',
      subtitle: 'Conéctate en segundos',
      getStarted: 'Comenzar',
      existingUser: '¿Cliente que regresa?',
      signup: 'Registrarse para WiFi',
      login: 'Inicio de Sesión',
      name: 'Nombre Completo',
      email: 'Correo Electrónico',
      dateOfBirth: 'Fecha de Nacimiento',
      marketingConsent: 'Me gustaría recibir ofertas especiales y actualizaciones',
      termsAccept: 'Acepto los Términos de Servicio y Política de Privacidad',
      createAccount: 'Crear Cuenta y Conectar',
      loginButton: 'Iniciar Sesión y Conectar',
      backToWelcome: 'Atrás',
      success: '¡Estás Conectado!',
      loyaltyProgress: 'Tu progreso de lealtad',
      dataRemaining: 'Datos restantes',
      enjoyWifi: 'Disfruta tu acceso WiFi gratuito'
    }
  }

  const t = texts[language]

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      toast.success('Account created successfully!')
      setCurrentStep('success')
    } catch (error) {
      toast.error('Failed to create account. Please try again.')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      toast.success('Welcome back!')
      setCurrentStep('success')
    } catch (error) {
      toast.error('Invalid credentials. Please try again.')
    }
  }

  return (
    <div className="min-h-screen captive-portal-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Language Selector */}
        <div className="flex justify-center mb-8">
          <div className="language-selector">
            <button
              onClick={() => setLanguage('en')}
              className={`language-option ${language === 'en' ? 'active' : ''}`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('es')}
              className={`language-option ${language === 'es' ? 'active' : ''}`}
            >
              Español
            </button>
          </div>
        </div>

        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-2xl shadow-2xl p-8"
        >
          {currentStep === 'welcome' && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <div className="bg-blue-100 p-4 rounded-full">
                  <Wifi className="h-12 w-12 text-blue-600" />
                </div>
              </div>
              
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.welcome}</h1>
              <p className="text-gray-600 mb-8">{t.subtitle}</p>
              
              <div className="space-y-4">
                <button
                  onClick={() => setCurrentStep('signup')}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  {t.getStarted}
                </button>
                
                <button
                  onClick={() => setCurrentStep('login')}
                  className="w-full bg-gray-100 text-gray-700 py-3 px-6 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                >
                  {t.existingUser}
                </button>
              </div>

              {/* Features */}
              <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                <div className="flex flex-col items-center">
                  <Globe className="h-6 w-6 text-blue-600 mb-2" />
                  <span className="text-xs text-gray-600">Fast</span>
                </div>
                <div className="flex flex-col items-center">
                  <Shield className="h-6 w-6 text-green-600 mb-2" />
                  <span className="text-xs text-gray-600">Secure</span>
                </div>
                <div className="flex flex-col items-center">
                  <Users className="h-6 w-6 text-purple-600 mb-2" />
                  <span className="text-xs text-gray-600">Social</span>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'signup' && (
            <div>
              <button
                onClick={() => setCurrentStep('welcome')}
                className="text-gray-600 hover:text-gray-800 mb-4 flex items-center"
              >
                ← {t.backToWelcome}
              </button>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-6">{t.signup}</h2>
              
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.name}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.email}
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.dateOfBirth}
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="flex items-start space-x-2">
                  <input
                    type="checkbox"
                    id="marketing"
                    checked={formData.marketingConsent}
                    onChange={(e) => setFormData({ ...formData, marketingConsent: e.target.checked })}
                    className="mt-1"
                  />
                  <label htmlFor="marketing" className="text-sm text-gray-600">
                    {t.marketingConsent}
                  </label>
                </div>
                
                <div className="flex items-start space-x-2">
                  <input type="checkbox" id="terms" required className="mt-1" />
                  <label htmlFor="terms" className="text-sm text-gray-600">
                    {t.termsAccept}
                  </label>
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  {t.createAccount}
                </button>
              </form>
            </div>
          )}

          {currentStep === 'login' && (
            <div>
              <button
                onClick={() => setCurrentStep('welcome')}
                className="text-gray-600 hover:text-gray-800 mb-4 flex items-center"
              >
                ← {t.backToWelcome}
              </button>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-6">{t.login}</h2>
              
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.email}
                  </label>
                  <input
                    type="email"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.dateOfBirth}
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  {t.loginButton}
                </button>
              </form>
            </div>
          )}

          {currentStep === 'success' && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <div className="bg-green-100 p-4 rounded-full">
                  <Wifi className="h-12 w-12 text-green-600" />
                </div>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.success}</h2>
              <p className="text-gray-600 mb-6">{t.enjoyWifi}</p>
              
              {/* Loyalty Progress */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">{t.loyaltyProgress}</h3>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Bronze Member</span>
                  <span className="text-sm text-gray-600">2/5 visits to Silver</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="loyalty-bronze h-2 rounded-full" style={{ width: '40%' }}></div>
                </div>
              </div>
              
              {/* Data Usage */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">{t.dataRemaining}</h3>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">750 MB included</span>
                  <span className="text-sm text-gray-600">750 MB left</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}