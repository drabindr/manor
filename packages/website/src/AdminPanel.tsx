import React, { useState, useEffect } from "react";

type Home = {
  homeId: string;
  name: string;
  normalizedHome: string;
};

const defaultIntegrations = {
  // Philips Hue section removed.
  google: {
    clientId: "",
    clientSecret: "",
    redirectUri: "",
    refreshToken: "",
    projectId: ""
  },
  tplink: {
    cloudUsername: "",
    cloudPassword: "",
    deviceID: "",
    terminalUUID: ""
  }
};

// Enhanced haptic feedback helper
const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
  if ('vibrate' in navigator) {
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate([50, 25, 50]);
        break;
      case 'heavy':
        navigator.vibrate([100, 50, 100]);
        break;
    }
  }
};

const AdminPanel: React.FC = () => {
  // API URL without trailing slash.
  const adminApiUrl = "https://nocd1rav49.execute-api.us-east-1.amazonaws.com/prod";
  const [homeName, setHomeName] = useState("");
  const [integrations, setIntegrations] = useState(defaultIntegrations);
  const [homes, setHomes] = useState<Home[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${adminApiUrl}/homes`)
      .then((res) => res.json())
      .then((data) => setHomes(data))
      .catch((err) => console.error("Error fetching homes:", err));
  }, [adminApiUrl]);

  const handleCreateHome = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('medium'); // Haptic feedback for form submission
    try {
      const res = await fetch(`${adminApiUrl}/homes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: homeName, integrations }),
      });
      if (res.ok) {
        const newHome = await res.json();
        setHomes([...homes, newHome]);
        setHomeName("");
        setIntegrations(defaultIntegrations);
        setMessage("Home created successfully!");
        triggerHaptic('medium');
      } else {
        const errorData = await res.json();
        setMessage("Error: " + errorData.error);
      }
    } catch (error) {
      console.error("Error creating home:", error);
      setMessage("Error creating home");
    }
  };

  const handleIntegrationChange = (provider: string, key: string, value: string) => {
    setIntegrations((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider as keyof typeof prev],
        [key]: value,
      },
    }));
  };

  const handleUpdateHome = async (homeId: string) => {
    triggerHaptic('light'); // Light haptic for update action
    try {
      const res = await fetch(`${adminApiUrl}/homes/${homeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrations }),
      });
      if (res.ok) {
        setMessage("Home integrations updated successfully!");
        triggerHaptic('medium');
      } else {
        const errorData = await res.json();
        setMessage("Error updating home: " + errorData.error);
      }
    } catch (error) {
      console.error("Error updating home:", error);
      setMessage("Error updating home");
    }
  };

  const handleDeleteHome = async (homeId: string) => {
    if (!window.confirm("Are you sure you want to delete this home? This action cannot be undone.")) {
      return;
    }
    triggerHaptic('heavy'); // Heavy haptic for destructive action
    try {
      const res = await fetch(`${adminApiUrl}/homes/${homeId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        mode: 'cors' // Confirm mode is set to 'cors'
      });
      if (res.ok) {
        setHomes(homes.filter((home) => home.homeId !== homeId));
        setMessage("Home deleted successfully!");
        triggerHaptic('heavy');
      } else {
        const errorData = await res.json();
        setMessage("Error deleting home: " + errorData.error);
      }
    } catch (error) {
      console.error("Error deleting home:", error);
      setMessage("Error deleting home");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white ios-viewport-fix overscroll-none">
      {/* Header matching Casa Guard style with safe area support */}
      <header
        className="fixed top-0 w-full h-14 flex items-center justify-between bg-gray-800 border-b border-gray-700 px-4 z-50 ios-safe-top"
        style={{
          background:
            "linear-gradient(to right, rgba(40,40,40,0.8), rgba(30,30,30,0.8))",
          backdropFilter: "blur(6px)",
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          height: "calc(3.5rem + env(safe-area-inset-top))",
        }}
      >
        <h1 className="text-3xl font-bold">Admin Panel</h1>
      </header>

      <main 
        className="container mx-auto px-4 safe-area-padding-x"
        style={{
          paddingTop: "calc(5rem + env(safe-area-inset-top))",
          paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
        }}
      >
        {message && (
          <div className="mb-4 p-4 bg-green-800 text-green-300 rounded">
            {message}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create Home Section */}
          <section className="bg-gray-900/80 p-6 rounded-2xl shadow-xl border border-gray-700/50 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-3 mb-6">
              Create Home
            </h2>
            <form onSubmit={handleCreateHome} className="space-y-4">
              <div>
                <label htmlFor="home-name" className="block text-gray-300 mb-1">Home Name</label>
                <input
                  id="home-name"
                  type="text"
                  value={homeName}
                  onChange={(e) => setHomeName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-touch-safe min-h-[48px] touch-manipulation transition-all duration-200 focus:scale-[1.02] transform"
                  placeholder="e.g., 720 Front Rd"
                  required
                />
              </div>
              <div className="space-y-4">
                {/* Google Nest Integration */}
                <fieldset className="border border-gray-700/60 p-5 rounded-xl bg-gray-800/30">
                  <legend className="text-lg font-medium text-gray-200 px-3">
                    Google Nest Integration
                  </legend>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Client ID", key: "clientId" },
                      { label: "Client Secret", key: "clientSecret" },
                      { label: "Redirect URI", key: "redirectUri" },
                      { label: "Refresh Token", key: "refreshToken" },
                      { label: "Project ID", key: "projectId" },
                    ].map((field) => (
                      <div key={field.key}>
                        <label htmlFor={`google-${field.key}`} className="block text-gray-400 mb-1">
                          {field.label}
                        </label>
                        <input
                          id={`google-${field.key}`}
                          type="text"
                          value={(integrations.google as any)[field.key]}
                          onChange={(e) =>
                            handleIntegrationChange(
                              "google",
                              field.key,
                              e.target.value
                            )
                          }
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-touch-safe min-h-[48px] touch-manipulation transition-all duration-200 focus:scale-[1.02] transform"
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
                {/* TP-Link Integration */}
                <fieldset className="border border-gray-700/60 p-5 rounded-xl bg-gray-800/30">
                  <legend className="text-lg font-medium text-gray-200 px-3">
                    TP-Link Integration
                  </legend>
                  <div className="mb-2">
                    <label htmlFor="tplink-username" className="block text-gray-400 mb-1">
                      Cloud Username
                    </label>
                    <input
                      id="tplink-username"
                      type="text"
                      value={integrations.tplink.cloudUsername}
                      onChange={(e) =>
                        handleIntegrationChange(
                          "tplink",
                          "cloudUsername",
                          e.target.value
                        )
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-touch-safe min-h-[48px] touch-manipulation transition-all duration-200 focus:scale-[1.02] transform"
                    />
                  </div>
                  <div className="mb-2">
                    <label htmlFor="tplink-password" className="block text-gray-400 mb-1">
                      Cloud Password
                    </label>
                    <input
                      id="tplink-password"
                      type="password"
                      value={integrations.tplink.cloudPassword}
                      onChange={(e) =>
                        handleIntegrationChange(
                          "tplink",
                          "cloudPassword",
                          e.target.value
                        )
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-touch-safe min-h-[48px] touch-manipulation transition-all duration-200 focus:scale-[1.02] transform"
                    />
                  </div>
                  <div className="mb-2">
                    <label htmlFor="tplink-deviceid" className="block text-gray-400 mb-1">
                      Device ID
                    </label>
                    <input
                      id="tplink-deviceid"
                      type="text"
                      value={integrations.tplink.deviceID}
                      onChange={(e) =>
                        handleIntegrationChange("tplink", "deviceID", e.target.value)
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-touch-safe min-h-[48px] touch-manipulation transition-all duration-200 focus:scale-[1.02] transform"
                    />
                  </div>
                  <div>
                    <label htmlFor="tplink-terminaluuid" className="block text-gray-400 mb-1">
                      Terminal UUID
                    </label>
                    <input
                      id="tplink-terminaluuid"
                      type="text"
                      value={integrations.tplink.terminalUUID}
                      onChange={(e) =>
                        handleIntegrationChange("tplink", "terminalUUID", e.target.value)
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-touch-safe min-h-[48px] touch-manipulation transition-all duration-200 focus:scale-[1.02] transform"
                    />
                  </div>
                </fieldset>
              </div>
              <button
                type="submit"
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold text-lg min-h-[52px] touch-manipulation transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                style={{ transform: 'translateZ(0)' }}
              >
                Create Home
              </button>
            </form>
          </section>
          {/* View Homes Section */}
          <section className="bg-gray-900/80 p-6 rounded-2xl shadow-xl border border-gray-700/50 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-3 mb-6">
              Existing Homes
            </h2>
            {homes.length === 0 ? (
              <p className="text-gray-400">
                No homes found. Create one above.
              </p>
            ) : (
              <div className="space-y-4">
                {homes.map((home) => (
                  <div
                    key={home.homeId}
                    className="p-5 border border-gray-700/60 rounded-xl bg-gray-800/40 backdrop-blur-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-200 hover:bg-gray-800/60 hover:border-gray-600/60"
                  >
                    <div>
                      <p className="font-bold text-xl">{home.name}</p>
                      <p className="text-sm text-gray-400">ID: {home.homeId}</p>
                      <p className="text-sm text-gray-400">
                        Normalized: {home.normalizedHome}
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 mt-3 sm:mt-0 w-full sm:w-auto">
                      <button
                        onClick={() => handleUpdateHome(home.homeId)}
                        className="bg-green-600 text-white py-3 px-5 rounded-xl hover:bg-green-700 transition-all duration-200 font-medium min-h-[48px] min-w-[120px] touch-manipulation transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900 haptic-light"
                        style={{ transform: 'translateZ(0)' }}
                      >
                        Update Integrations
                      </button>
                      <button
                        onClick={() => handleDeleteHome(home.homeId)}
                        className="bg-red-600 text-white py-3 px-5 rounded-xl hover:bg-red-700 transition-all duration-200 font-medium min-h-[48px] min-w-[120px] touch-manipulation transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 haptic-heavy"
                        style={{ transform: 'translateZ(0)' }}
                      >
                        Delete Home
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <footer 
        className="bg-gray-800 text-white py-6 mt-8"
        style={{
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="container mx-auto px-4 text-center safe-area-padding-x">
          © {new Date().getFullYear()} Casa Guard. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default AdminPanel;
