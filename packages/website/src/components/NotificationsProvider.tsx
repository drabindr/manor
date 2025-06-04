import React, { createContext, useState, useContext, ReactNode } from 'react';

interface Notification {
  message: string;
  type: string;
  id: number;
  command?: string;
}

interface NotificationsContextType {
  notifications: Notification[];
  showNotification: (message: string, type: string, command?: string) => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};

interface NotificationsProviderProps {
  children: ReactNode;
}

export const NotificationsProvider: React.FC<NotificationsProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Enhanced notification function that handles replacing "awaiting" notifications
  const showNotification = (message: string, type: string, command?: string) => {
    const id = Date.now();
    
    setNotifications((prev) => {
      // If this is a success message and we have a command
      if (type === "success" && command) {
        // Remove any "awaiting result" or "processing" notifications for the same command
        const filtered = prev.filter(n => 
          !(n.command === command && 
            (n.message.includes("sent to system") || 
             n.message.includes("processing") ||
             n.message.includes("queued")))
        );
        return [...filtered, { message, type, id, command }];
      } else {
        // For non-success messages, just add them
        return [...prev, { message, type, id, command }];
      }
    });
    
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  };

  return (
    <NotificationsContext.Provider value={{ notifications, showNotification }}>
      {children}
      <div className="notification-container fixed top-16 right-4 z-50">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`p-2 mb-2 rounded bg-${n.type === "error" ? "red" : n.type === "success" ? "green" : n.type === "warning" ? "yellow" : "blue"}-500 text-white flex items-center shadow-lg animate-fade-in`}
          >
            {n.message}
            <button
              onClick={() => setNotifications((prev) => prev.filter((notif) => notif.id !== n.id))}
              className="ml-2 text-white/80 hover:text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
};

export default NotificationsProvider;