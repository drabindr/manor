import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [currentScreenshot, setCurrentScreenshot] = useState(0)
  const [intervalId, setIntervalId] = useState(null)

  const screenshots = [
    { src: '1.png', label: 'Climate' },
    { src: '6.png', label: 'Cameras' },
    { src: '4.png', label: 'Devices' },
    { src: '5.png', label: 'Security' }
  ]

  useEffect(() => {
    startAutoCycle()
    return () => stopAutoCycle()
  }, [])

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

  const handleScreenshotSelect = (index) => {
    stopAutoCycle()
    setCurrentScreenshot(index)
  }

  return (
    <div className="bg-gray-50 font-sans antialiased">
      {/* Header */}
      <header className="shadow-md sticky top-0 z-50 border-b border-gray-200 overflow-visible bg-[#FEFDF6]">
        <nav className="container mx-auto px-4 sm:px-6 h-20 flex justify-between items-center">
          <a href="#" className="flex items-center flex-shrink-0">
            <img className="h-20 w-auto" src="logo2.png" alt="MANOR logo" />
            <span className="ml-3 text-3xl md:text-4xl font-extrabold tracking-tight uppercase text-primary">MANOR</span>
          </a>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <a href="#features" className="hidden sm:block text-gray-700 hover:text-primary font-medium px-3 py-2 rounded-md transition duration-150 ease-in-out">Features</a>
            <a href="#how-it-works" className="hidden sm:block text-gray-700 hover:text-primary font-medium px-3 py-2 rounded-md transition duration-150 ease-in-out">How It Works</a>
            <a href="#pricing" className="hidden sm:block text-gray-700 hover:text-primary font-medium px-3 py-2 rounded-md transition duration-150 ease-in-out">Pricing</a>
            <a href="#cta" className="bg-primary hover:bg-primary-dark text-white font-semibold py-1 px-3 sm:py-2 sm:px-5 rounded-lg text-sm sm:text-base transition duration-300 shadow-sm hover:shadow-md whitespace-nowrap">Get Started</a>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-green-100 to-yellow-100 py-20 md:py-32 fade-in">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-800 leading-tight mb-4">
            Unified Control for Your Smart Home & Security
          </h1>
          <p className="text-lg md:text-xl text-gray-700 mb-8 max-w-3xl mx-auto">
            MANOR brings your lights, thermostat, cameras, security, and air quality monitoring together into one seamless, intuitive platform. Experience real-time control and peace of mind, anywhere.
          </p>
          <a href="#cta" className="inline-block bg-primary hover:bg-primary-dark text-white font-bold py-2 px-6 sm:py-3 sm:px-8 rounded-lg text-base sm:text-lg transition duration-300 shadow-lg hover:shadow-xl">
            Secure Your Home Today
          </a>
          <div className="mt-12">
            <img src="hero.png" alt="Modern Smart Home Security System" className="hero-image mx-auto rounded-lg shadow-xl w-full max-w-full sm:max-w-3xl" />
          </div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="py-12 md:py-16 bg-white">
        <div className="container mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">Tired of Juggling Multiple Smart Home Apps?</h2>
            <p className="text-gray-600 mb-6 text-lg">
              Managing different apps for lights, heating, security cameras, and air quality sensors can be frustrating and inefficient. You lose track of settings, miss important alerts, and struggle to make your devices work together.
            </p>
            <h3 className="text-2xl font-semibold text-primary-dark mb-3">MANOR is the Solution</h3>
            <p className="text-gray-600 text-lg">
              Our cloud-based platform integrates seamlessly with popular brands like Google Nest, TP-Link, and Airthings, providing a single, powerful interface to monitor and control your entire smart home ecosystem in real-time.
            </p>
          </div>
          <div>
            <img src="hero2.png" alt="Complexity vs Simplicity illustration" className="rounded-lg shadow-md mx-auto" />
          </div>
        </div>
      </section>

      {/* iPhone Demo Gallery */}
      <section id="gallery" className="py-12 md:py-16 bg-white">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 text-center mb-12">See MANOR in Action</h2>
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
      <section id="features" className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 text-center mb-12">Everything You Need, All in One Place</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition duration-300 flex items-start space-x-4">
              <div className="flex-shrink-0 text-primary icon-feature">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 12h-11a.5.5 0 0 0 0 1h11a.5.5 0 0 0 0-1Z"/>
                  <path d="M12 17.5v-11a.5.5 0 0 0-1 0v11a.5.5 0 0 0 1 0Z"/>
                  <path d="M7.19 7.19 6.5 6.5m11 11-.69.69"/>
                  <path d="m6.5 17.5.69-.69m-.69-10.31.69.69"/>
                  <circle cx="12" cy="12" r="10"/>
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Real-time Device Control</h3>
                <p className="text-gray-600">Instantly manage lights, thermostats, cameras, and more from our web or mobile app.</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition duration-300 flex items-start space-x-4">
              <div className="flex-shrink-0 text-primary icon-feature">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
                  <path d="m9 12 2 2 4-4"/>
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Advanced Security</h3>
                <p className="text-gray-600">Arm/disarm your system, view event logs, and receive instant alerts on any suspicious activity.</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition duration-300 flex items-start space-x-4">
              <div className="flex-shrink-0 text-accent icon-feature">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8Z"/>
                  <path d="M12 12v-4"/>
                  <path d="M12 16h.01"/>
                  <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                  <path d="M12 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/>
                  <path d="M12 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Smart Automation</h3>
                <p className="text-gray-600">Automatically adjust settings based on your location (home/away) for convenience and energy savings.</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition duration-300 flex items-start space-x-4">
              <div className="flex-shrink-0 text-primary icon-feature">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Seamless Integrations</h3>
                <p className="text-gray-600">Connects effortlessly with Google Nest, TP-Link, Airthings, and more of your favorite smart devices.</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition duration-300 flex items-start space-x-4">
              <div className="flex-shrink-0 text-primary icon-feature">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/>
                  <circle cx="12" cy="13" r="3"/>
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Live & Recorded Video</h3>
                <p className="text-gray-600">Access live camera feeds and review recorded events securely stored in the cloud.</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition duration-300 flex items-start space-x-4">
              <div className="flex-shrink-0 text-accent icon-feature">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.5 4.5a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z"/>
                  <path d="M12.5 4.5a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z"/>
                  <path d="M18.5 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
                  <path d="M18.5 10.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/>
                  <path d="M5.5 13.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>
                  <path d="M5.5 13.5a2 2 0 1 1 0 4 2 2 0 0 1 0 4Z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Air Quality Insights</h3>
                <p className="text-gray-600">Monitor indoor air quality (radon, CO2, VOCs) with integrated sensors like Airthings.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">Powered by Reliable Cloud Technology</h2>
          <p className="text-lg text-gray-600 mb-12 max-w-3xl mx-auto">
            MANOR utilizes a secure and scalable serverless architecture on AWS, ensuring high performance, reliability, and real-time updates without the complexity.
          </p>
          <div className="relative flex flex-col md:flex-row justify-center items-center space-y-8 md:space-y-0 md:space-x-8 text-gray-700">
            <div className="flex flex-col items-center text-center max-w-xs">
              <div className="bg-green-100 text-primary rounded-full p-4 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 14h.01"/>
                  <path d="M17 10h.01"/>
                  <path d="M10 14h.01"/>
                  <path d="M10 10h.01"/>
                  <path d="M16 4H8a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4Z"/>
                  <path d="M7 2v2"/>
                  <path d="M17 2v2"/>
                </svg>
              </div>
              <h3 className="font-semibold mb-1">1. Your Devices</h3>
              <p className="text-sm">Google Nest, TP-Link, Airthings, Cameras, Sensors & More</p>
            </div>
            <div className="hidden md:block text-gray-400 px-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
            <div className="flex flex-col items-center text-center max-w-xs">
              <div className="bg-yellow-100 text-accent-dark rounded-full p-4 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                </svg>
              </div>
              <h3 className="font-semibold mb-1">2. MANOR Cloud (AWS)</h3>
              <p className="text-sm">Securely processes commands, manages integrations, and sends real-time updates.</p>
            </div>
            <div className="hidden md:block text-gray-400 px-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
            <div className="flex flex-col items-center text-center max-w-xs">
              <div className="bg-green-100 text-primary rounded-full p-4 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
                  <path d="M12 18h.01"/>
                </svg>
              </div>
              <h3 className="font-semibold mb-1">3. Your Control</h3>
              <p className="text-sm">Access via intuitive Web Dashboard or Mobile App (iOS/Android).</p>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Integration Ticker */}
      <section className="py-16 bg-gray-100">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-12">
            Integrates With Your Favorite Brands
          </h2>
          <div className="ticker-wrap">
            <div className="ticker-move animate-ticker">
              <img src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Google_Nest_logo.svg" alt="Google Nest Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Nest'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/TPLINK_Logo_2.svg" alt="TP-Link Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=TP-Link'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/3/3a/Philips_Hue_logo.svg" alt="Philips Hue Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Hue'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Airthings_logo.svg" alt="Airthings Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Airthings'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" alt="AWS Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=AWS'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Google_Nest_logo.svg" alt="Google Nest Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Nest'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/TPLINK_Logo_2.svg" alt="TP-Link Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=TP-Link'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/3/3a/Philips_Hue_logo.svg" alt="Philips Hue Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Hue'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Airthings_logo.svg" alt="Airthings Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=Airthings'} />
              <img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" alt="AWS Logo" onError={(e) => e.target.src='https://placehold.co/150x60/e0e0e0/a0a0a0?text=AWS'} />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 text-center mb-4">Choose Your Plan</h2>
          <p className="text-lg text-gray-600 text-center mb-12 max-w-xl mx-auto">Simple, transparent pricing to fit your smart home needs.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Essentials Plan */}
            <div className="border border-gray-200 rounded-lg p-8 flex flex-col">
              <h3 className="text-2xl font-semibold text-gray-800 mb-4">Essentials</h3>
              <p className="text-gray-500 mb-6 flex-grow">Perfect for getting started with unified smart home control.</p>
              <div className="mb-8">
                <span className="text-4xl font-bold text-gray-800">$9.99</span>
                <span className="text-gray-500">/ month</span>
              </div>
              <ul className="space-y-3 mb-8 text-gray-600">
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Real-time Control (Lights, Thermostats)
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Basic Security (Arm/Disarm, Event Log)
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Web & Mobile App Access
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Standard Integrations (Nest, TP-Link)
                </li>
              </ul>
              <a href="#" className="mt-auto w-full text-center bg-primary-light hover:bg-primary text-primary-dark hover:text-white font-medium py-3 px-6 rounded-lg transition duration-300">
                Choose Essentials
              </a>
            </div>

            {/* Pro Control Plan */}
            <div className="border-2 border-primary rounded-lg p-8 flex flex-col relative shadow-lg">
              <span className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-primary text-white text-sm font-semibold px-3 py-1 rounded-full">Most Popular</span>
              <h3 className="text-2xl font-semibold text-gray-800 mb-4">Pro Control</h3>
              <p className="text-gray-500 mb-6 flex-grow">Unlock advanced features, automation, and enhanced security.</p>
              <div className="mb-8">
                <span className="text-4xl font-bold text-gray-800">$19.99</span>
                <span className="text-gray-500">/ month</span>
              </div>
              <ul className="space-y-3 mb-8 text-gray-600">
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Everything in Essentials, plus:
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Location-based Automation
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Live & Recorded Video Streaming (Basic)
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Air Quality Monitoring Integration
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Priority Support
                </li>
              </ul>
              <a href="#" className="mt-auto w-full text-center bg-primary hover:bg-primary-dark text-white font-medium py-3 px-6 rounded-lg transition duration-300">
                Choose Pro Control
              </a>
            </div>

            {/* Total Security Plan */}
            <div className="border border-gray-200 rounded-lg p-8 flex flex-col">
              <h3 className="text-2xl font-semibold text-gray-800 mb-4">Total Security</h3>
              <p className="text-gray-500 mb-6 flex-grow">Comprehensive security, advanced video features, and premium support.</p>
              <div className="mb-8">
                <span className="text-4xl font-bold text-gray-800">$29.99</span>
                <span className="text-gray-500">/ month</span>
              </div>
              <ul className="space-y-3 mb-8 text-gray-600">
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Everything in Pro Control, plus:
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Extended Event History (30 days)
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Advanced Video Storage Options
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Multi-User Access Control
                </li>
                <li className="flex items-center">
                  <svg className="pricing-checkmark mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Dedicated Support Channel
                </li>
              </ul>
              <a href="#" className="mt-auto w-full text-center bg-primary-light hover:bg-primary text-primary-dark hover:text-white font-medium py-3 px-6 rounded-lg transition duration-300">
                Choose Total Security
              </a>
            </div>
          </div>
          <p className="text-center text-gray-500 mt-12">Need more? <a href="#" className="text-primary hover:underline">Contact us</a> for enterprise solutions.</p>
        </div>
      </section>

      {/* CTA Section */}
      <section id="cta" className="py-20 md:py-32 bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-8">Ready to Simplify Your Smart Home?</h2>
          <p className="text-lg md:text-xl text-green-100 mb-12 max-w-3xl mx-auto">
            Get started with MANOR today and enjoy unified control, enhanced security, and intelligent automation for your home.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-6">
            <a href="#pricing" className="bg-white hover:bg-gray-100 text-primary-dark font-bold py-3 px-8 rounded-lg text-lg transition duration-300 shadow-lg hover:shadow-xl">
              Choose Your Plan
            </a>
            <a href="#features" className="bg-transparent border-2 border-white hover:bg-white hover:text-primary-dark text-white font-bold py-3 px-8 rounded-lg text-lg transition duration-300">
              Explore Features
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 py-8">
        <div className="container mx-auto px-6 text-center">
          <p>&copy; 2025 MANOR. All rights reserved.</p>
          <div className="mt-4">
            <a href="#" className="hover:text-white mx-2">Privacy Policy</a> |
            <a href="#" className="hover:text-white mx-2">Terms of Service</a> |
            <a href="#" className="hover:text-white mx-2">Contact Us</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
