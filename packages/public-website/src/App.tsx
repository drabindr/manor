import { useState, useEffect } from 'react'
import { ArrowRight, CheckCircle, Activity, Shield, Video, Bell, MapPin, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import './App.css'

interface Screenshot {
  src: string
  label: string
}

function App() {
  const [currentScreenshot, setCurrentScreenshot] = useState<number>(0)
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const screenshots: Screenshot[] = [
    { src: 'demo/IMG_2006.PNG', label: 'Climate' },
    { src: 'demo/IMG_2007.PNG', label: 'Cameras' },
    { src: 'demo/IMG_2008.PNG', label: 'Devices' },
    { src: 'demo/IMG_2009.PNG', label: 'Devices' },
    { src: 'demo/IMG_2010.PNG', label: 'Security' }
  ]

  const stopAutoCycle = () => {
    if (intervalId) {
      clearInterval(intervalId)
      setIntervalId(null)
    }
  }

  const startAutoCycle = () => {
    // Always stop any existing cycle first
    if (intervalId) {
      clearInterval(intervalId)
    }
    
    if (screenshots.length > 1) {
      const id = setInterval(() => {
        setCurrentScreenshot(prev => (prev + 1) % screenshots.length)
      }, 4000) // Slightly faster cycling
      setIntervalId(id)
    }
  }

  useEffect(() => {
    let mounted = true
    
    // Add a small delay to ensure component is fully mounted
    const timer = setTimeout(() => {
      if (mounted) {
        startAutoCycle()
      }
    }, 100)
    
    return () => {
      mounted = false
      clearTimeout(timer)
      stopAutoCycle()
    }
  }, []) // Empty dependency array to run only once

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
      <header className={`bg-white/95 border-b border-gray-200/50 sticky top-0 z-50 backdrop-blur-sm transition-all duration-300 ease-in-out ${
        isHeaderVisible ? 'translate-y-0 shadow-sm' : '-translate-y-full'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4 group">
              <div className="relative">
                <img 
                  src="logo2.png" 
                  alt="MANOR Logo" 
                  className="h-16 w-16 transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-orange-400/20 to-green-400/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>
              <span className="ml-3 text-3xl md:text-4xl font-extrabold tracking-tight uppercase text-green-600 font-sans transition-all duration-300 group-hover:scale-105" style={{fontFamily: 'Inter, sans-serif'}}>
                MANOR
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-slate-700 hover:text-orange-600 font-medium transition-all duration-300 hover:scale-105 relative group">
                Features
                <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-300 group-hover:w-full"></div>
              </a>
              <a href="#gallery" className="text-slate-700 hover:text-orange-600 font-medium transition-all duration-300 hover:scale-105 relative group">
                Demo
                <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-300 group-hover:w-full"></div>
              </a>
              <a href="#signup" className="btn-primary">
                Get Started
              </a>
            </nav>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <div className="relative w-6 h-6">
                <span className={`absolute top-0 left-0 w-full h-0.5 bg-slate-600 rounded-full transition-all duration-300 ${
                  isMenuOpen ? 'rotate-45 translate-y-2.5' : ''
                }`}></span>
                <span className={`absolute top-2.5 left-0 w-full h-0.5 bg-slate-600 rounded-full transition-all duration-300 ${
                  isMenuOpen ? 'opacity-0' : ''
                }`}></span>
                <span className={`absolute top-5 left-0 w-full h-0.5 bg-slate-600 rounded-full transition-all duration-300 ${
                  isMenuOpen ? '-rotate-45 -translate-y-2.5' : ''
                }`}></span>
              </div>
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-200 fade-in">
              <nav className="flex flex-col space-y-4">
                <a href="#features" className="text-slate-700 hover:text-orange-600 font-medium transition-colors duration-200 p-2 rounded-lg hover:bg-orange-50">
                  Features
                </a>
                <a href="#gallery" className="text-slate-700 hover:text-orange-600 font-medium transition-colors duration-200 p-2 rounded-lg hover:bg-orange-50">
                  Demo
                </a>
                <a href="#signup" className="btn-primary w-fit">
                  Get Started
                </a>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-white pt-16 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh-1"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50/30 via-yellow-50/20 to-green-50/30"></div>
        
        {/* Animated background elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-br from-orange-200/30 to-yellow-200/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-green-200/30 to-yellow-200/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Content */}
            <div className="fade-in-left">
              <h1 className="text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-tight">
                Smart Home
                <span className="block text-gradient-hero font-extrabold">
                  Security & Automation
                </span>
              </h1>
              
              <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-lg">
                Monitor, control, and secure your smart home with MANOR's cloud-based platform. 
                Real-time insights, automated responses, and enterprise-level security.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <a href="#signup" className="btn-primary flex items-center justify-center group">
                  Secure Your Home Today
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </a>
                
                <a href="#gallery" className="btn-secondary inline-flex items-center justify-center group">
                  <Activity className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                  View Live Demo
                </a>
              </div>

              {/* Enhanced trust indicators */}
              <div className="flex items-center space-x-6 text-sm text-slate-600">
                <div className="flex items-center group">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-2 group-hover:bg-green-200 transition-colors">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <span className="font-medium">CSA Certified</span>
                </div>
                <div className="flex items-center group">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2 group-hover:bg-blue-200 transition-colors">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium">99.9% Uptime SLA</span>
                </div>
                <div className="flex items-center group">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-2 group-hover:bg-purple-200 transition-colors">
                    <CheckCircle className="h-4 w-4 text-purple-600" />
                  </div>
                  <span className="font-medium">24/7 Support</span>
                </div>
              </div>
            </div>

            {/* Hero Image */}
            <div className="relative fade-in-right">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-400/20 to-green-400/20 rounded-2xl blur-xl transform rotate-3"></div>
              <img src="hero.png" alt="Modern Smart Home Security System" className="relative rounded-2xl shadow-2xl w-full hover:shadow-3xl transition-shadow duration-300" />
            </div>
          </div>

          {/* Enhanced Stats */}
          <div className="mt-20 grid grid-cols-1 md:grid-cols-4 gap-8 fade-in-up">
            <div className="text-center group">
              <div className="text-4xl font-bold text-gradient mb-2 group-hover:scale-110 transition-transform">50,000+</div>
              <div className="text-slate-600 font-medium">Homes Protected</div>
            </div>
            <div className="text-center group">
              <div className="text-4xl font-bold text-gradient mb-2 group-hover:scale-110 transition-transform">99.9%</div>
              <div className="text-slate-600 font-medium">Uptime Guarantee</div>
            </div>
            <div className="text-center group">
              <div className="text-4xl font-bold text-gradient mb-2 group-hover:scale-110 transition-transform">150+</div>
              <div className="text-slate-600 font-medium">Device Integrations</div>
            </div>
            <div className="text-center group">
              <div className="text-4xl font-bold text-gradient mb-2 group-hover:scale-110 transition-transform">24/7</div>
              <div className="text-slate-600 font-medium">Monitoring & Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* iPhone Demo Gallery */}
      <section id="gallery" className="py-20 bg-gradient-to-br from-slate-50 via-orange-50/30 to-yellow-50/30 relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh-1"></div>
        
        {/* Animated background elements */}
        <div className="absolute top-10 left-20 w-64 h-64 bg-gradient-to-br from-orange-200/20 to-yellow-200/20 rounded-full blur-2xl animate-pulse"></div>
        <div className="absolute bottom-10 right-20 w-80 h-80 bg-gradient-to-br from-green-200/20 to-blue-200/20 rounded-full blur-2xl animate-pulse delay-500"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 fade-in-up">
            <div className="inline-flex items-center bg-gradient-to-r from-blue-100 to-purple-100 rounded-full px-4 py-2 mb-6 border border-blue-200">
              <Video className="h-4 w-4 mr-2 text-blue-600" />
              <span className="text-blue-700 text-sm font-medium">Interactive Demo</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              See MANOR in
              <span className="block text-gradient">Action</span>
            </h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto mb-4">
              Experience our intuitive mobile interface that puts complete control of your smart home at your fingertips.
            </p>
            {/* Dynamic description based on current screen */}
            <div className="text-center mb-8">
              <p className="text-lg text-slate-500 max-w-2xl mx-auto">
                {currentScreenshot === 0 && "Monitor and control your home's climate with intelligent automation and energy insights."}
                {currentScreenshot === 1 && "Live camera feeds with AI-powered motion detection and cloud recording."}
                {currentScreenshot === 2 && "Device management interface showing all connected smart home devices."}
                {currentScreenshot === 3 && "Advanced device controls and automation settings for your smart home ecosystem."}
                {currentScreenshot === 4 && "Real-time security alerts and monitoring with instant notifications."}
              </p>
            </div>
          </div>
          
          <div className="flex justify-center scale-in">
            <div className="flex flex-col items-center space-y-8">
              {/* Enhanced iPhone Frame */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-[55px] blur-xl transform rotate-1 scale-105"></div>
                <div 
                  className="relative iphone-frame pulse-glow"
                  onMouseEnter={stopAutoCycle}
                  onMouseLeave={startAutoCycle}
                >
                  <div className="iphone-inner-bezel">
                    <div className="iphone-screen">
                      <div className="iphone-notch"></div>
                      <img 
                        src={screenshots[currentScreenshot].src} 
                        alt={`MANOR App Screenshot - ${screenshots[currentScreenshot].label}`} 
                        className="transition-all duration-500 ease-in-out transform hover:scale-105"
                      />
                    </div>
                  </div>
                  
                  {/* Navigation arrows for devices */}
                  {screenshots[currentScreenshot]?.label === 'Devices' && (
                    <>
                      {currentScreenshot > 2 && (
                        <button
                          onClick={() => handleScreenshotSelect(currentScreenshot - 1)}
                          className="absolute left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all duration-300 hover:scale-110"
                        >
                          <ChevronLeft className="h-5 w-5 text-gray-700" />
                        </button>
                      )}
                      {currentScreenshot < 3 && (
                        <button
                          onClick={() => handleScreenshotSelect(currentScreenshot + 1)}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all duration-300 hover:scale-110"
                        >
                          <ChevronRight className="h-5 w-5 text-gray-700" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* Enhanced App Menu Bar */}
              <div 
                className="app-menu-bar glass-effect shadow-lg"
                onMouseEnter={stopAutoCycle}
                onMouseLeave={startAutoCycle}
              >
                {screenshots.map((screenshot, index) => {
                  // Group devices together but show individual indicators
                  const isDevicesGroup = screenshot.label === 'Devices'
                  const isCurrentDevicesPage = screenshot.label === 'Devices' && 
                    (index === currentScreenshot || (screenshots[currentScreenshot]?.label === 'Devices'))
                  const isActive = index === currentScreenshot
                  
                  // Skip rendering duplicate device tabs, but keep the first one
                  if (isDevicesGroup && index > 0 && screenshots[index - 1]?.label === 'Devices') {
                    return null
                  }
                  
                  return (
                    <div
                      key={index}
                      className={`menu-item ${isActive || isCurrentDevicesPage ? 'active' : ''} group`}
                      onClick={() => handleScreenshotSelect(index)}
                    >
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-all duration-300 ${
                          isActive || isCurrentDevicesPage ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                        }`}>
                          {index === 0 && <Activity className="h-4 w-4" />}
                          {index === 1 && <Video className="h-4 w-4" />}
                          {(index === 2 || index === 3) && <Shield className="h-4 w-4" />}
                          {index === 4 && <Bell className="h-4 w-4" />}
                        </div>
                        <span className="text-xs font-medium">{screenshot.label}</span>
                        {/* Show page indicator for devices */}
                        {isDevicesGroup && (
                          <div className="flex space-x-1 mt-1">
                            <div className={`w-1 h-1 rounded-full transition-all duration-300 ${
                              currentScreenshot === 2 ? 'bg-orange-500' : 'bg-gray-300'
                            }`}></div>
                            <div className={`w-1 h-1 rounded-full transition-all duration-300 ${
                              currentScreenshot === 3 ? 'bg-orange-500' : 'bg-gray-300'
                            }`}></div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* Progress indicator */}
              <div className="flex space-x-2">
                {screenshots.map((_, index) => {
                  // Special handling for device pages
                  if (index === 3) return null; // Skip second device page indicator
                  
                  const isActive = index === currentScreenshot || 
                    (index === 2 && currentScreenshot === 3); // Show devices as active for both pages
                  
                  return (
                    <div
                      key={index}
                      className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                        isActive ? 'bg-orange-500 w-8' : 'bg-gray-300 hover:bg-gray-400 w-2'
                      }`}
                      onClick={() => handleScreenshotSelect(index)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh-2"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 fade-in-up">
            <div className="inline-flex items-center bg-gradient-to-r from-orange-100 to-yellow-100 rounded-full px-4 py-2 mb-6 border border-orange-200">
              <Shield className="h-4 w-4 mr-2 text-orange-600" />
              <span className="text-orange-700 text-sm font-medium">Enterprise-Grade Platform</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              Advanced Features for
              <span className="block text-gradient">Smart Home Management</span>
            </h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Built for reliability, security, and scale. Our comprehensive platform provides everything 
              you need to monitor, control, and secure your smart home infrastructure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
            <div className="card-hover bg-white rounded-2xl p-8 border border-gray-200 relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-orange-200 rounded-xl flex items-center justify-center mb-6 border border-orange-200 group-hover:scale-110 transition-transform duration-300">
                  <Activity className="h-7 w-7 text-orange-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-4">Real-Time Monitoring</h3>
                <p className="text-slate-600 leading-relaxed">
                  Comprehensive device monitoring with live status updates, performance metrics, and instant anomaly detection across your entire smart home ecosystem.
                </p>
              </div>
            </div>

            <div className="card-hover bg-white rounded-2xl p-8 border border-gray-200 relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-green-200 rounded-xl flex items-center justify-center mb-6 border border-green-200 group-hover:scale-110 transition-transform duration-300">
                  <Shield className="h-7 w-7 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-4">Enterprise Security</h3>
                <p className="text-slate-600 leading-relaxed">
                  Bank-level encryption, multi-factor authentication, and continuous security monitoring to protect your home and personal data.
                </p>
              </div>
            </div>

            <div className="card-hover bg-white rounded-2xl p-8 border border-gray-200 relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-xl flex items-center justify-center mb-6 border border-yellow-200 group-hover:scale-110 transition-transform duration-300">
                  <MapPin className="h-7 w-7 text-yellow-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-4">Geofencing Automation</h3>
                <p className="text-slate-600 leading-relaxed">
                  Intelligent location-based triggers that automatically adjust security settings, climate control, and lighting based on occupancy patterns.
                </p>
              </div>
            </div>

            <div className="card-hover bg-white rounded-2xl p-8 border border-gray-200 relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-red-100 rounded-xl flex items-center justify-center mb-6 border border-orange-200 group-hover:scale-110 transition-transform duration-300">
                  <Video className="h-7 w-7 text-orange-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-4">Cloud Video Storage</h3>
                <p className="text-slate-600 leading-relaxed">
                  Secure cloud recording with AI-powered motion detection, facial recognition, and unlimited storage for critical security footage.
                </p>
              </div>
            </div>

            <div className="card-hover bg-white rounded-2xl p-8 border border-gray-200 relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-teal-50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-teal-100 rounded-xl flex items-center justify-center mb-6 border border-green-200 group-hover:scale-110 transition-transform duration-300">
                  <Bell className="h-7 w-7 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-4">Intelligent Alerts</h3>
                <p className="text-slate-600 leading-relaxed">
                  Smart notification system that learns your preferences and delivers contextual alerts through multiple channels including mobile, email, and SMS.
                </p>
              </div>
            </div>

            <div className="card-hover bg-white rounded-2xl p-8 border border-gray-200 relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-yellow-100 to-orange-100 rounded-xl flex items-center justify-center mb-6 border border-yellow-200 group-hover:scale-110 transition-transform duration-300">
                  <BarChart3 className="h-7 w-7 text-yellow-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-4">Advanced Analytics</h3>
                <p className="text-slate-600 leading-relaxed">
                  Detailed insights into energy usage, security patterns, and device performance with predictive maintenance recommendations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Integration Ticker */}
      <section className="py-16 bg-gradient-to-br from-orange-50 to-yellow-50 relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh-2"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="fade-in-up">
            <div className="inline-flex items-center bg-gradient-to-r from-indigo-100 to-purple-100 rounded-full px-4 py-2 mb-6 border border-indigo-200">
              <CheckCircle className="h-4 w-4 mr-2 text-indigo-600" />
              <span className="text-indigo-700 text-sm font-medium">Trusted Integrations</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
              Works With Your
              <span className="text-gradient"> Favorite Brands</span>
            </h2>
            <p className="text-slate-600 mb-12 max-w-2xl mx-auto">
              Seamlessly integrate with over 150+ smart home devices and platforms for a unified experience.
            </p>
          </div>
          
          <div className="ticker-wrap">
            <div className="ticker-move animate-ticker">
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Google_Nest_logo.svg" alt="Google Nest Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Nest'} />
              </div>
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/TPLINK_Logo_2.svg" alt="TP-Link Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=TP-Link'} />
              </div>
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/3/3a/Philips_Hue_logo.svg" alt="Philips Hue Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Hue'} />
              </div>
              <div className="brand-logo-container">
                <img src="/orbit.svg" alt="Orbit Logo" />
              </div>
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Airthings_logo.svg" alt="Airthings Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Airthings'} />
              </div>
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" alt="AWS Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=AWS'} />
              </div>
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Google_Nest_logo.svg" alt="Google Nest Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Nest'} />
              </div>
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/TPLINK_Logo_2.svg" alt="TP-Link Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=TP-Link'} />
              </div>
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/3/3a/Philips_Hue_logo.svg" alt="Philips Hue Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Hue'} />
              </div>
              <div className="brand-logo-container">
                <img src="/orbit.svg" alt="Orbit Logo" />
              </div>
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Airthings_logo.svg" alt="Airthings Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Airthings'} />
              </div>
              <div className="brand-logo-container">
                <img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" alt="AWS Logo" onError={(e) => (e.target as HTMLImageElement).src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=AWS'} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Email Signup Section */}
      <section id="signup" className="py-20 md:py-32 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 text-white relative overflow-hidden">
        {/* Enhanced background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,146,60,0.1),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(34,197,94,0.1),transparent_50%)]"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="fade-in-up">
            <div className="inline-flex items-center glass-effect rounded-full px-4 py-2 mb-8 border border-white/20">
              <Bell className="h-4 w-4 mr-2 text-orange-400" />
              <span className="text-orange-100 text-sm font-medium">Early Access</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-8">
              Be the First to Know
            </h2>
            <p className="text-lg md:text-xl text-slate-300 mb-12 max-w-3xl mx-auto">
              Get exclusive updates on product releases, new features, and special offers. 
              Join our community of smart home enthusiasts.
            </p>
          </div>
          
          {!isSubmitted ? (
            <div className="max-w-lg mx-auto scale-in">
              <div className="flex flex-col sm:flex-row gap-4 p-2 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20">
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
                  className="flex-1 px-6 py-4 rounded-xl bg-white/10 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-800 border border-white/20 backdrop-blur-sm"
                  required
                />
                <button
                  onClick={() => {
                    if (email.trim() && !isSubmitting) {
                      submitEmail(email.trim())
                    }
                  }}
                  disabled={isSubmitting}
                  className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-orange-400 disabled:to-orange-400 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 whitespace-nowrap flex items-center justify-center group"
                >
                  {isSubmitting ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Submitting...
                    </div>
                  ) : (
                    <div className="flex items-center">
                      Get Updates
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  )}
                </button>
              </div>
              {submitError && (
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-300 text-sm">
                    {submitError}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-center mt-6 space-x-6 text-sm text-slate-400">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-400" />
                  No spam, ever
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-400" />
                  Easy unsubscribe
                </div>
                <div className="flex items-center">
                  <Shield className="h-4 w-4 mr-2 text-green-400" />
                  Privacy protected
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto scale-in">
              <div className="glass-effect rounded-2xl p-8 backdrop-blur-sm border border-white/20">
                <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-3xl font-bold mb-4 text-gradient">Thank You!</h3>
                <p className="text-slate-300 text-lg">
                  You're all set! We'll keep you updated with the latest from MANOR.
                </p>
                <div className="mt-6 flex items-center justify-center space-x-4 text-sm text-slate-400">
                  <div className="flex items-center">
                    <Bell className="h-4 w-4 mr-2" />
                    Check your email
                  </div>
                </div>
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
                Intelligent home security and automation made simple.
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
                <span>Crafted in</span>
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
