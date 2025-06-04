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
    try {
      const res = await fetch(`${adminApiUrl}/homes/${homeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrations }),
      });
      if (res.ok) {
        setMessage("Home integrations updated successfully!");
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
    try {
      const res = await fetch(`${adminApiUrl}/homes/${homeId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        mode: 'cors' // Confirm mode is set to 'cors'
      });
      if (res.ok) {
        setHomes(homes.filter((home) => home.homeId !== homeId));
        setMessage("Home deleted successfully!");
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
    <div className="min-h-screen bg-black text-white">
      {/* Header matching Casa Guard style */}
      <header
        className="fixed top-0 w-full h-14 flex items-center justify-between bg-gray-800 border-b border-gray-700 px-4 z-50"
        style={{
          background:
            "linear-gradient(to right, rgba(40,40,40,0.8), rgba(30,30,30,0.8))",
          backdropFilter: "blur(6px)",
        }}
      >
        <h1 className="text-3xl font-bold">Admin Panel</h1>
      </header>

      <main className="pt-20 container mx-auto px-4">
        {message && (
          <div className="mb-4 p-4 bg-green-800 text-green-300 rounded">
            {message}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create Home Section */}
          <section className="bg-gray-900 p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold border-b pb-2 mb-4">
              Create Home
            </h2>
            <form onSubmit={handleCreateHome} className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-1">Home Name</label>
                <input
                  type="text"
                  value={homeName}
                  onChange={(e) => setHomeName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 720 Front Rd"
                  required
                />
              </div>
              <div className="space-y-4">
                {/* Google Nest Integration */}
                <fieldset className="border border-gray-700 p-4 rounded">
                  <legend className="text-lg font-medium text-gray-200">
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
                        <label className="block text-gray-400 mb-1">
                          {field.label}
                        </label>
                        <input
                          type="text"
                          value={(integrations.google as any)[field.key]}
                          onChange={(e) =>
                            handleIntegrationChange(
                              "google",
                              field.key,
                              e.target.value
                            )
                          }
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
                {/* TP-Link Integration */}
                <fieldset className="border border-gray-700 p-4 rounded">
                  <legend className="text-lg font-medium text-gray-200">
                    TP-Link Integration
                  </legend>
                  <div className="mb-2">
                    <label className="block text-gray-400 mb-1">
                      Cloud Username
                    </label>
                    <input
                      type="text"
                      value={integrations.tplink.cloudUsername}
                      onChange={(e) =>
                        handleIntegrationChange(
                          "tplink",
                          "cloudUsername",
                          e.target.value
                        )
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="mb-2">
                    <label className="block text-gray-400 mb-1">
                      Cloud Password
                    </label>
                    <input
                      type="password"
                      value={integrations.tplink.cloudPassword}
                      onChange={(e) =>
                        handleIntegrationChange(
                          "tplink",
                          "cloudPassword",
                          e.target.value
                        )
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="mb-2">
                    <label className="block text-gray-400 mb-1">
                      Device ID
                    </label>
                    <input
                      type="text"
                      value={integrations.tplink.deviceID}
                      onChange={(e) =>
                        handleIntegrationChange("tplink", "deviceID", e.target.value)
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">
                      Terminal UUID
                    </label>
                    <input
                      type="text"
                      value={integrations.tplink.terminalUUID}
                      onChange={(e) =>
                        handleIntegrationChange("tplink", "terminalUUID", e.target.value)
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </fieldset>
              </div>
              <button
                type="submit"
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded hover:from-blue-700 hover:to-purple-700 transition"
              >
                Create Home
              </button>
            </form>
          </section>
          {/* View Homes Section */}
          <section className="bg-gray-900 p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold border-b pb-2 mb-4">
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
                    className="p-4 border border-gray-700 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center"
                  >
                    <div>
                      <p className="font-bold text-xl">{home.name}</p>
                      <p className="text-sm text-gray-400">ID: {home.homeId}</p>
                      <p className="text-sm text-gray-400">
                        Normalized: {home.normalizedHome}
                      </p>
                    </div>
                    <div className="flex space-x-2 mt-2 sm:mt-0">
                      <button
                        onClick={() => handleUpdateHome(home.homeId)}
                        className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition"
                      >
                        Update Integrations
                      </button>
                      <button
                        onClick={() => handleDeleteHome(home.homeId)}
                        className="bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 transition"
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
      <footer className="bg-gray-800 text-white py-4 mt-8">
        <div className="container mx-auto px-4 text-center">
          © {new Date().getFullYear()} Casa Guard. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default AdminPanel;
