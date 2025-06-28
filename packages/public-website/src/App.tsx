import { useState, useEffect } from 'react'
import { Menu, X, ArrowRight, CheckCircle, Activity, Shield, Video, Bell, MapPin, BarChart3 } from 'lucide-react'
import './App.css'

interface Screenshot {
  src: string
  label: string
}

function App() {
  const [currentScreenshot, setCurrentScreenshot] = useState<number>(0)
  const [intervalId, setIntervalId] = useState<number | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const screenshots: Screenshot[] = [
    { src: '1.png', label: 'Climate' },
    { src: '6.png', label: 'Cameras' },
    { src: '4.png', label: 'Devices' },
    { src: '5.png', label: 'Security' }
  ]

  useEffect(() => {
    startAutoCycle()
    return () => stopAutoCycle()
  }, [])

  useEffect(() => {
    const controlHeaderVisibility = () => {
      const currentScrollY = window.scrollY
      
      if (currentScrollY < 100) {
        // Always show header at the top
        setIsHeaderVisible(true)
      } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling down
        setIsHeaderVisible(false)
      } else if (currentScrollY < lastScrollY) {
        // Scrolling up
        setIsHeaderVisible(true)
      }
      
      setLastScrollY(currentScrollY)
    }

    window.addEventListener('scroll', controlHeaderVisibility)
    return () => window.removeEventListener('scroll', controlHeaderVisibility)
  }, [lastScrollY])

  const startAutoCycle = () => {
    stopAutoCycle()
    if (screenshots.length > 1) {
      const id = setInterval(() => {
        setCurrentScreenshot(prev => (prev + 1) % screenshots.length)
      }, 5000)
      setIntervalId(id)
    }
  }

  const stopAutoCycle = () => {
    if (intervalId) {
      clearInterval(intervalId)
      setIntervalId(null)
    }
  }

  const submitEmail = async (emailAddress: string) => {
    setIsSubmitting(true)
    setSubmitError('')
    
    try {
      // Using the deployed email API from ManorEmailStack
      const apiUrl = 'https://rqpb2oof21.execute-api.us-east-1.amazonaws.com/prod/email/signup'
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailAddress }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to submit email')
      }

      const result = await response.json()
      setIsSubmitted(true)
      console.log('Email submitted successfully:', result)
    } catch (error) {
      console.error('Error submitting email:', error)
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit email. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleScreenshotSelect = (index: number) => {
    stopAutoCycle()
    setCurrentScreenshot(index)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className={`bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm transition-transform duration-300 ease-in-out ${
        isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <img 
                src="logo2.png" 
                alt="MANOR Logo" 
                className="h-16 w-16"
              />
              <span className="ml-3 text-3xl md:text-4xl font-extrabold tracking-tight uppercase text-primary font-sans" style={{fontFamily: 'Inter, sans-serif'}}>
                MANOR
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-slate-700 hover:text-orange-600 font-medium transition-colors">
                Features
              </a>
              <a href="#gallery" className="text-slate-700 hover:text-orange-600 font-medium transition-colors">
                Demo
              </a>
              <a href="#signup" className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-2.5 rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition-all duration-200 shadow-lg hover:shadow-xl">
                Get Started
              </a>
            </nav>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-200">
              <nav className="flex flex-col space-y-4">
                <a href="#features" className="text-slate-700 hover:text-orange-600 font-medium">
                  Features
                </a>
                <a href="#gallery" className="text-slate-700 hover:text-orange-600 font-medium">
                  Demo
                </a>
                <a href="#signup" className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-2.5 rounded-lg font-medium w-fit">
                  Get Started
                </a>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-white pt-16 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-yellow-50 to-green-50"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Content */}
            <div>
              <div className="inline-flex items-center bg-gradient-to-r from-orange-100 to-yellow-100 rounded-full px-4 py-2 mb-8 border border-orange-200">
                <img src="logo2.png" alt="MANOR" className="h-4 w-4 mr-2" />
                <span className="text-orange-700 text-sm font-medium">Enterprise-grade smart home platform</span>
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-tight">
                Intelligent Home
                <span className="block bg-gradient-to-r from-orange-600 via-yellow-500 to-green-600 bg-clip-text text-transparent">
                  Security & Automation
                </span>
              </h1>
              
              <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-lg">
                Monitor, control, and secure your smart home with MANOR's cloud-based platform. 
                Real-time insights, automated responses, and enterprise-level security.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <a href="#signup" className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-8 py-4 rounded-lg font-semibold hover:from-orange-600 hover:to-orange-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center group">
                  Request Enterprise Demo
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </a>
                
                <a href="#gallery" className="border-2 border-orange-300 text-orange-700 px-8 py-4 rounded-lg font-semibold hover:bg-orange-50 transition-colors inline-flex items-center justify-center">
                  View Live Demo
                </a>
              </div>

              {/* Trust indicators */}
              <div className="flex items-center space-x-6 text-sm text-slate-600">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  CSA Certified
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  99.9% Uptime SLA
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  24/7 Support
                </div>
              </div>
            </div>

            {/* Hero Image */}
            <div className="relative">
              <img src="hero.png" alt="Modern Smart Home Security System" className="rounded-2xl shadow-2xl w-full" />
            </div>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent mb-2">50,000+</div>
              <div className="text-slate-600">Homes Protected</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent mb-2">99.9%</div>
              <div className="text-slate-600">Uptime Guarantee</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-yellow-600 to-yellow-500 bg-clip-text text-transparent mb-2">150+</div>
              <div className="text-slate-600">Device Integrations</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 via-yellow-500 to-green-600 bg-clip-text text-transparent mb-2">24/7</div>
              <div className="text-slate-600">Monitoring & Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* iPhone Demo Gallery */}
      <section id="gallery" className="py-20 bg-gradient-to-br from-slate-50 via-orange-50/30 to-yellow-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">See MANOR in Action</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Experience our intuitive mobile interface that puts complete control of your smart home at your fingertips.
            </p>
          </div>
          
          <div className="flex justify-center">
            <div className="flex flex-col items-center space-y-6">
              <div 
                className="iphone-frame"
                onMouseEnter={stopAutoCycle}
                onMouseLeave={startAutoCycle}
              >
                <div className="iphone-inner-bezel">
                  <div className="iphone-screen">
                    <div className="iphone-notch"></div>
                    <img 
                      src={screenshots[currentScreenshot].src} 
                      alt={`MANOR App Screenshot - ${screenshots[currentScreenshot].label}`} 
                      className="transition-opacity duration-300 ease-in-out"
                    />
                  </div>
                </div>
              </div>
              <div 
                className="app-menu-bar"
                onMouseEnter={stopAutoCycle}
                onMouseLeave={startAutoCycle}
              >
                {screenshots.map((screenshot, index) => (
                  <div
                    key={index}
                    className={`menu-item ${index === currentScreenshot ? 'active' : ''}`}
                    onClick={() => handleScreenshotSelect(index)}
                  >
                    <span>{screenshot.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Enterprise-Grade Platform Features
            </h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Built for reliability, security, and scale. Our comprehensive platform provides everything 
              you need to monitor, control, and secure your smart home infrastructure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
            <div className="bg-white rounded-xl p-8 border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg flex items-center justify-center mb-6 border border-orange-200">
                <Activity className="h-6 w-6 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Real-Time Monitoring</h3>
              <p className="text-slate-600 leading-relaxed">
                Comprehensive device monitoring with live status updates, performance metrics, and instant anomaly detection across your entire smart home ecosystem.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-12 h-12 bg-gradient-to-br from-green-50 to-green-100 rounded-lg flex items-center justify-center mb-6 border border-green-200">
                <Shield className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Enterprise Security</h3>
              <p className="text-slate-600 leading-relaxed">
                Bank-level encryption, multi-factor authentication, and continuous security monitoring to protect your home and personal data.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg flex items-center justify-center mb-6 border border-yellow-200">
                <MapPin className="h-6 w-6 text-yellow-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Geofencing Automation</h3>
              <p className="text-slate-600 leading-relaxed">
                Intelligent location-based triggers that automatically adjust security settings, climate control, and lighting based on occupancy patterns.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg flex items-center justify-center mb-6 border border-orange-200">
                <Video className="h-6 w-6 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Cloud Video Storage</h3>
              <p className="text-slate-600 leading-relaxed">
                Secure cloud recording with AI-powered motion detection, facial recognition, and unlimited storage for critical security footage.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-12 h-12 bg-gradient-to-br from-green-50 to-green-100 rounded-lg flex items-center justify-center mb-6 border border-green-200">
                <Bell className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Intelligent Alerts</h3>
              <p className="text-slate-600 leading-relaxed">
                Smart notification system that learns your preferences and delivers contextual alerts through multiple channels including mobile, email, and SMS.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg flex items-center justify-center mb-6 border border-yellow-200">
                <BarChart3 className="h-6 w-6 text-yellow-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Advanced Analytics</h3>
              <p className="text-slate-600 leading-relaxed">
                Detailed insights into energy usage, security patterns, and device performance with predictive maintenance recommendations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Integration Ticker */}
      <section className="py-16 bg-gradient-to-br from-orange-50 to-yellow-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-12">
            Integrates With Your Favorite Brands
          </h2>
          <div className="ticker-wrap">
            <div className="ticker-move animate-ticker">
              <img src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Google_Nest_logo.svg" alt="Google Nest Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Nest'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/TPLINK_Logo_2.svg" alt="TP-Link Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=TP-Link'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/3/3a/Philips_Hue_logo.svg" alt="Philips Hue Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Hue'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Airthings_logo.svg" alt="Airthings Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Airthings'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" alt="AWS Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=AWS'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Google_Nest_logo.svg" alt="Google Nest Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Nest'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/TPLINK_Logo_2.svg" alt="TP-Link Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=TP-Link'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/3/3a/Philips_Hue_logo.svg" alt="Philips Hue Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Hue'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Airthings_logo.svg" alt="Airthings Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Airthings'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" alt="AWS Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=AWS'} />
            </div>
          </div>
        </div>
      </section>

      {/* Email Signup Section */}
      <section id="signup" className="py-20 md:py-32 bg-gradient-to-br from-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-8">Product Updates & Notifications</h2>
          <p className="text-lg md:text-xl text-slate-300 mb-12 max-w-3xl mx-auto">
            Stay informed about platform updates, new features, and enterprise announcements. Join our professional network.
          </p>
          
          {!isSubmitted ? (
            <div className="max-w-md mx-auto">
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && email.trim() && !isSubmitting) {
                      submitEmail(email.trim())
                    }
                  }}
                  placeholder="Enter your email address"
                  className="flex-1 px-6 py-4 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-800"
                  required
                />
                <button
                  onClick={() => {
                    if (email.trim() && !isSubmitting) {
                      submitEmail(email.trim())
                    }
                  }}
                  disabled={isSubmitting}
                  className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-bold py-4 px-8 rounded-lg transition duration-300 shadow-lg hover:shadow-xl whitespace-nowrap"
                >
                  {isSubmitting ? 'Processing...' : 'Subscribe to Updates'}
                </button>
              </div>
              {submitError && (
                <p className="text-red-400 text-sm mt-4">
                  {submitError}
                </p>
              )}
              <p className="text-sm text-slate-400 mt-4">
                Enterprise-grade privacy protection. Unsubscribe anytime.
              </p>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <div className="bg-white/10 rounded-lg p-8 backdrop-blur-sm">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">Thank You!</h3>
                <p className="text-slate-300">
                  You're subscribed! We'll keep you informed about MANOR platform developments.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-4 mb-4">
                <img src="logo2.png" alt="MANOR" className="h-14 w-14" />
                <span className="ml-3 text-3xl md:text-4xl font-extrabold tracking-tight uppercase text-primary font-sans" style={{fontFamily: 'Inter, sans-serif'}}>MANOR</span>
              </div>
              <p className="text-slate-400 mb-4">
                Professional smart home automation and security platform.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#gallery" className="hover:text-white transition-colors">Demo</a></li>
                <li><a href="#signup" className="hover:text-white transition-colors">Updates</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <p className="text-center md:text-left">&copy; 2025 MANOR. All rights reserved.</p>
              <div className="flex items-center space-x-2 text-slate-400">
                <span>Proudly Canadian Technology</span>
                <span className="text-red-500 text-lg">🇨🇦</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
